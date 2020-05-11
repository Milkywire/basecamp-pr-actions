# Basecamp Todo and PR sync actions

Github actions to update todos in Basecamp 3

When creating a PR this action will move any ToDos linked in the PR description to a dev review group and add a link to the PR as a Todo comment. When the PR is merged the ToDos will be marked as merged.

If you have a message with all todos in dev review this action will also keep the message update to date with Todos waiting for review.

## Inputs

### `basecamp-access-token`

**Required** An access token to your basecamp setup to be able to update ToDos.

### `basecamp-message-team-id:`

If you have a message with all todo in dev review then this should be set to the team id for where the message is located.

### `basecamp-message-id`

If you have a message with all todo in dev review then this should be set with the id for the message.

## Example usage

uses: milkywire/basecamp-action
with:
basecamp-access-token: \${{ secrets.BASECAMP_ACCESS_TOKEN }}
basecamp-message-team-id: '16945383'
basecamp-message-id: '2612345915'
