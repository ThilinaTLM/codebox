---
description: deploy changes to coolify
---
- If there any unstaged changes stage all the git changes (`git add -A`)
- If there are uncommited changes run `make ci` and fix any issue that found
- If there are uncommited changes commit the changes
- Push the commits
- Use deploy.yml github action to build, push and deploy the docker containers on coolify
- Monitor the progress using github cli and then coolify cli
