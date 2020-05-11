const superagent = require('superagent');
const cheerio = require('cheerio');

function fetchUrl(url) {
  return superagent
    .get(url)
    .set('Authorization', `Bearer ${AUTH_TOKEN}`)
    .set('User-Agent', 'Milkywire Github Action (dev@milkywire.com)');
}

let AUTH_TOKEN = '';
exports.setAuthToken = function (basecampToken) {
  AUTH_TOKEN = basecampToken;
};

exports.setTodoAsInReview = async function (body, pullRequestUrl, teamId, messageId) {
  const todoLinks = getTodoLinksFromPullRequestBody(body);
  if (todoLinks.length > 1) {
    const firstLink = todoLinks.shift();
    await pullRequestReviewUpdates(firstLink, pullRequestUrl, teamId, messageId);
  }
  await Promise.all(
    todoLinks.map(async (link) => {
      await pullRequestReviewUpdates(link, pullRequestUrl, teamId, messageId);
    }),
  );
};

exports.setTodoAsDone = async function (body, teamId, messageId) {
  const todoLinks = getTodoLinksFromPullRequestBody(body);
  await Promise.all(
    todoLinks.map(async (link) => {
      const { todo, accountId } = await fetchTodo(link);
      await markTodoAsDone(todo, accountId);

      if (teamId && messageId) {
        await removeLinkFromDevReviewMessage(accountId, teamId, messageId, todo);
      }
    }),
  );
};

async function pullRequestReviewUpdates(link, pullRequestUrl, teamId, messageId) {
  const { todo, accountId } = await fetchTodo(link);
  await moveTodoToDevReview(todo, accountId);
  await postCommentWithPullRequestLink(todo, pullRequestUrl);

  if (teamId && messageId) {
    await updateDevReviewMessage(accountId, teamId, messageId, todo, pullRequestUrl);
  }
}

function getTodoLinksFromPullRequestBody(body) {
  const basecampTodoLinkRegex = /https:\/\/3\.basecamp\.com\/(\d*)\/buckets\/(\d*)\/todos\/(\d*)/g;
  const links = body.match(basecampTodoLinkRegex) || [];
  return links;
}

async function fetchTodo(todoLink) {
  const todoLinkPartsRegex = /https:\/\/3\.basecamp\.com\/(?<accountId>\d*)\/buckets\/(?<projectId>\d*)\/todos\/(?<todoId>\d*)/;

  const parts = todoLink.match(todoLinkPartsRegex);
  const { accountId, projectId, todoId } = parts.groups;
  const url = `https://3.basecampapi.com/${accountId}/buckets/${projectId}/todos/${todoId}.json`;
  const { body: todo } = await fetchUrl(url);
  return { todo, accountId, projectId, todoId };
}

async function moveTodoToDevReview(todo, accountId) {
  if (todo.parent.title !== 'Dev review') {
    const todoList = await findTopLevelTodoList(todo);
    const devReviewGroup = await findOrCreateDevReviewGroup(todoList);
    console.log('Moving todo to Dev review group');
    await moveTodo(
      `https://3.basecampapi.com/${accountId}/buckets/${todo.bucket.id}/todos/${todo.id}`,
      devReviewGroup.id,
    );
  }
}

async function findTopLevelTodoList(item) {
  if (item.groups_url) {
    return item;
  }

  const { body } = await fetchUrl(item.parent.url);
  return findTopLevelTodoList(body);
}

async function findOrCreateDevReviewGroup(todoList) {
  const { body } = await fetchUrl(todoList.groups_url);
  let devReviewGroup = body.find((group) => group.name === 'Dev review');
  if (!devReviewGroup) {
    console.log('Creating Dev review group');
    devReviewGroup = await createDevReviewGroup(todoList);
  }
  return devReviewGroup;
}

async function createDevReviewGroup(todoList) {
  const { body } = await superagent
    .post(todoList.groups_url)
    .set('Authorization', `Bearer ${AUTH_TOKEN}`)
    .set('User-Agent', 'Milkywire Github Action (dev@milkywire.com)')
    .send({
      name: 'Dev review',
      color: 'green',
    });
  return body;
}

async function markTodoAsDone(todo) {
  const url = todo.completion_url;
  await superagent
    .post(url)
    .set('Authorization', `Bearer ${AUTH_TOKEN}`)
    .set('User-Agent', 'Milkywire Github Action (dev@milkywire.com)');
}

async function moveTodo(todoUrl, listId) {
  await superagent
    .put(`${todoUrl}/position.json?todo[parent_id]=${listId}`)
    .set('Authorization', `Bearer ${AUTH_TOKEN}`)
    .set('User-Agent', 'Milkywire Github Action (dev@milkywire.com)')
    .send({
      position: 1,
    });
}

async function postCommentWithPullRequestLink(todo, pullRequestUrl) {
  const newLink = `<div>PR: <a href="${pullRequestUrl}" target="_blank" rel="noreferrer">${pullRequestUrl}</a></div>`;
  const { body: comments } = await fetchUrl(todo.comments_url);
  const prComment = comments.find((comment) => comment.content.startsWith('<div>PR:'));
  if (!prComment) {
    console.log('Add todo comment with PR link');
    await superagent
      .post(todo.comments_url)
      .set('Authorization', `Bearer ${AUTH_TOKEN}`)
      .set('User-Agent', 'Milkywire Github Action (dev@milkywire.com)')
      .send({
        content: newLink,
      });
  }
}

async function updateDevReviewMessage(accountId, teamId, messageId, todo, pullRequestUrl) {
  const newLink = `<div><a href="${todo.app_url}">${todo.title} - ${todo.bucket.name}</a> PR: <a href="${pullRequestUrl}" target="_blank" rel="noreferrer">${pullRequestUrl}</a></div>`;

  const url = `https://3.basecampapi.com/${accountId}/buckets/${teamId}/messages/${messageId}.json`;

  const { body: message } = await fetchUrl(url);
  if (message.content.indexOf(newLink) !== -1) {
    return;
  }

  console.log('Updating Dev Review Message with todo and PR link');
  const body = {
    subject: message.subject,
    content: `${message.content}${newLink}`,
  };

  if (message.category) {
    body.category_id = message.category.id;
  }
  try {
    await superagent
    .put(url)
    .set('Authorization', `Bearer ${AUTH_TOKEN}`)
    .set('User-Agent', 'Milkywire Github Action (dev@milkywire.com)')
    .send(body);
  } catch (error) {
    console.log('Failed to update Dev Review Message', error)
  }

}

async function removeLinkFromDevReviewMessage(accountId, teamId, messageId, todo) {
  const url = `https://3.basecampapi.com/${accountId}/buckets/${teamId}/messages/${messageId}.json`;

  const { body: message } = await fetchUrl(url);
  const $ = cheerio.load(message.content);
  $(`a[href="${todo.app_url}"]`).parent().remove();
  
  const body = {
    subject: message.subject,
    content: $('body').html(),
  };

  if (message.category) {
    body.category_id = message.category.id;
  }
  try {
    await superagent
    .put(url)
    .set('Authorization', `Bearer ${AUTH_TOKEN}`)
    .set('User-Agent', 'Milkywire Github Action (dev@milkywire.com)')
    .send(body);
  } catch (error) {
    console.log('Failed to update Dev Review Message', error)
  }
}
