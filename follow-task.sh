#!/bin/bash

while true; do
    # Get current task ARN
    TASK_ARN=$(aws ecs list-tasks --cluster playwright-cluster --service-name playwright-service --region us-east-1 --query 'taskArns[0]' --output text)
    
    if [ -z "$TASK_ARN" ]; then
        echo "No tasks found"
        sleep 5
        continue
    fi

    # Get ENI ID from task
    ENI_ID=$(aws ecs describe-tasks --cluster playwright-cluster --tasks $TASK_ARN --region us-east-1 --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' --output text)
    
    if [ -z "$ENI_ID" ]; then
        echo "No ENI found"
        sleep 5
        continue
    fi

    # Get public IP from ENI
    PUBLIC_IP=$(aws ec2 describe-network-interfaces --network-interface-ids $ENI_ID --region us-east-1 --query 'NetworkInterfaces[0].Association.PublicIp' --output text)
    
    if [ -z "$PUBLIC_IP" ]; then
        echo "No public IP found"
        sleep 5
        continue
    fi

    echo "Current task: $TASK_ARN"
    echo "Current IP: $PUBLIC_IP"
    echo "Making request..."

    # Make the request
    curl -X POST http://$PUBLIC_IP:8931/scrape \
        -H "Content-Type: application/json" \
        -d '{"url": "https://www.google.com", "selector": "title"}' \
        -v

    echo -e "\nWaiting 5 seconds before next attempt..."
    sleep 5
done 