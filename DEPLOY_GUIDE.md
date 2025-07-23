# Deploy Guide for Playwright Server

## Building for AMD64 (AWS)

```bash
# Build the image for AMD64 architecture
docker buildx build --platform linux/amd64 --build-arg BUILDPLATFORM=linux/amd64 --build-arg TARGETPLATFORM=linux/amd64 -t playwright-server --load --no-cache .

# Tag and push to ECR
docker tag playwright-server:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME:latest

# Update ECS service (using task definition 1 which is known to work)
aws ecs update-service --cluster playwright-cluster --service playwright-service --task-definition playwright-server:1 --force-new-deployment --region us-east-2
```

## Environment Variables
```bash
export AWS_ACCOUNT_ID=850995574672
export AWS_REGION=us-east-2
export ECR_REPO_NAME=playwright-server
```

## Monitoring and Troubleshooting

### Check deployment status
```bash
# Check service deployment status
aws ecs describe-services --cluster playwright-cluster --services playwright-service --region us-east-2 | grep rolloutState

# Check running tasks
aws ecs list-tasks --cluster playwright-cluster --region us-east-2
```

### Get Task IP
```bash
# List tasks and get their details including IP addresses
aws ecs list-tasks --cluster playwright-cluster --region us-east-2 > result.json && \
aws ecs describe-tasks --cluster playwright-cluster --tasks $(jq -r '.taskArns[]' result.json) --region us-east-2
``` 