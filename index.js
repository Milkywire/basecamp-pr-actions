const core = require('@actions/core');
const { context } = require('@actions/github');
const { setTodoAsInReview, setTodoAsDone, setAuthToken } = require('./basecamp');

try {
  const basecampAccessToken = core.getInput('basecamp-access-token');
  const teamId = core.getInput('basecamp-message-team-id');
  const messageId = core.getInput('basecamp-message-id');

  if (context.eventName === 'pull_request') {
    setAuthToken(basecampAccessToken);

    if (context.payload.pull_request.merged) {
      setTodoAsDone(context.payload.pull_request.body, teamId, messageId);
    } else {
      setTodoAsInReview(
        context.payload.pull_request.body,
        context.payload.pull_request.html_url,
        teamId,
        messageId,
      );
    }
  }
} catch (error) {
  core.setFailed(error.message);
}
