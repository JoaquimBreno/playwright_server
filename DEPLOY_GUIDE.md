# 🚀 Deploy AWS - Passo a Passo

Este guia mostra como fazer deploy do Playwright MCP Server na AWS **comando por comando**.

## 📋 Pré-requisitos

### 1. Verificar ferramentas necessárias

```bash
# Verificar se AWS CLI está instalado
aws --version

# Se não estiver, instalar (macOS)
brew install awscli
```

```bash
# Verificar se Docker está rodando
docker --version
docker ps
```

### 2. Configurar AWS CLI

```bash
# Configurar credenciais (você será perguntado sobre Access Key, Secret, região)
aws configure

# Testar configuração
aws sts get-caller-identity
```

## 🔧 Definir Variáveis

Antes de começar, vamos definir as variáveis que usaremos. **Execute estes comandos no seu terminal:**

```bash
# Configure suas variáveis (ajuste conforme necessário)
export AWS_REGION="us-east-2"
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR_REPO_NAME="playwright-server"
export CLUSTER_NAME="playwright-cluster"
export SERVICE_NAME="playwright-service"
export TASK_FAMILY="playwright-server"

# Verificar se as variáveis foram definidas
echo "Região: $AWS_REGION"
echo "Account ID: $AWS_ACCOUNT_ID"
echo "ECR Repo: $ECR_REPO_NAME"
```

## 📦 Passo 1: Criar ECR Repository

```bash
# Verificar se já existe
aws ecr describe-repositories --repository-names $ECR_REPO_NAME --region $AWS_REGION
```

Se não existir, criar:
```bash
# Criar repository
aws ecr create-repository \
    --repository-name $ECR_REPO_NAME \
    --region $AWS_REGION \
    --image-scanning-configuration scanOnPush=true

echo "✅ ECR Repository criado!"
```

## 🔐 Passo 2: Login no ECR

```bash
# Fazer login no ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

echo "✅ Login no ECR realizado!"
```

## 🏗️ Passo 3: Build da Imagem Docker

```bash
# Definir tag da imagem
export DOCKER_TAG="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME:latest"

# Build da imagem
docker build -t $ECR_REPO_NAME .

# Tag para ECR
docker tag $ECR_REPO_NAME:latest $DOCKER_TAG

echo "✅ Build concluído!"
echo "Tag da imagem: $DOCKER_TAG"
```

## ⬆️ Passo 4: Push da Imagem

```bash
# Enviar imagem para ECR
docker push $DOCKER_TAG

echo "✅ Imagem enviada para ECR!"
```

## 🔒 Passo 5: Configurar Secrets (SSM)

```bash
# Criar parâmetros no SSM Parameter Store (com valores placeholder)
aws ssm put-parameter \
    --name "/playwright/PROXY_WS_ENDPOINT" \
    --value "CHANGE_ME" \
    --type "SecureString" \
    --region $AWS_REGION \
    --description "Playwright proxy endpoint"

aws ssm put-parameter \
    --name "/playwright/PROXY_USERNAME" \
    --value "CHANGE_ME" \
    --type "SecureString" \
    --region $AWS_REGION \
    --description "Playwright proxy username"

aws ssm put-parameter \
    --name "/playwright/PROXY_PASSWORD" \
    --value "CHANGE_ME" \
    --type "SecureString" \
    --region $AWS_REGION \
    --description "Playwright proxy password"

echo "✅ Parâmetros SSM criados (atualize os valores depois se necessário)!"
```

## 📊 Passo 6: Criar CloudWatch Log Group

```bash
# Criar log group
aws logs create-log-group --log-group-name "/ecs/playwright-server" --region $AWS_REGION

echo "✅ CloudWatch Log Group criado!"
```

## 🏢 Passo 7: Criar ECS Cluster

```bash
# Criar cluster ECS
aws ecs create-cluster --cluster-name $CLUSTER_NAME --region $AWS_REGION

echo "✅ ECS Cluster criado!"
```

## 📝 Passo 8: Preparar Task Definition

```bash
# Criar task definition atualizada (substituindo placeholders)
sed -e "s/REGION/$AWS_REGION/g" \
    -e "s/ACCOUNT_ID/$AWS_ACCOUNT_ID/g" \
    -e "s|joaquimbreno/playwright-server-amd64:latest|$DOCKER_TAG|g" \
    task-definition.json > task-definition-updated.json

# Registrar task definition
aws ecs register-task-definition \
    --cli-input-json file://task-definition-updated.json \
    --region $AWS_REGION

# Limpar arquivo temporário
rm task-definition-updated.json

echo "✅ Task Definition registrada!"
```

## 🌐 Passo 9: Configurar Rede

```bash
# Obter VPC padrão
export VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query 'Vpcs[0].VpcId' --output text --region $AWS_REGION)

# Obter subnets
export SUBNET_IDS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query 'Subnets[*].SubnetId' --output text --region $AWS_REGION)
export SUBNET_ARRAY=($SUBNET_IDS)

echo "VPC ID: $VPC_ID"
echo "Subnets: $SUBNET_IDS"
```

## 🛡️ Passo 10: Criar Security Group

```bash
# Nome do security group
export SG_NAME="playwright-server-sg"

# Criar security group
export SG_ID=$(aws ec2 create-security-group \
    --group-name $SG_NAME \
    --description "Security group for Playwright server" \
    --vpc-id $VPC_ID \
    --region $AWS_REGION \
    --query 'GroupId' --output text)

# Adicionar regra para porta 8931
aws ec2 authorize-security-group-ingress \
    --group-id $SG_ID \
    --protocol tcp \
    --port 8931 \
    --cidr 0.0.0.0/0 \
    --region $AWS_REGION

echo "✅ Security Group criado: $SG_ID"
```

## 🚀 Passo 11: Criar ECS Service

```bash
# Criar ECS Service
aws ecs create-service \
    --cluster $CLUSTER_NAME \
    --service-name $SERVICE_NAME \
    --task-definition $TASK_FAMILY \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[${SUBNET_ARRAY[0]},${SUBNET_ARRAY[1]}],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
    --region $AWS_REGION

echo "✅ ECS Service criado!"
```

## ⏳ Passo 12: Aguardar Deployment

```bash
# Aguardar service ficar estável (pode levar alguns minutos)
echo "Aguardando deployment... (isso pode levar alguns minutos)"
aws ecs wait services-stable --cluster $CLUSTER_NAME --services $SERVICE_NAME --region $AWS_REGION

echo "✅ Deployment concluído!"
```

## 📍 Passo 13: Obter IP da Aplicação

```bash
# Obter ARN da task
export TASK_ARN=$(aws ecs list-tasks --cluster $CLUSTER_NAME --service-name $SERVICE_NAME --region $AWS_REGION --query 'taskArns[0]' --output text)

# Obter network interface
export ENI_ID=$(aws ecs describe-tasks --cluster $CLUSTER_NAME --tasks $TASK_ARN --region $AWS_REGION --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' --output text)

# Obter IP público
export PUBLIC_IP=$(aws ec2 describe-network-interfaces --network-interface-ids $ENI_ID --region $AWS_REGION --query 'NetworkInterfaces[0].Association.PublicIp' --output text)

echo "🎉 Deploy concluído!"
echo "📍 Aplicação disponível em: http://$PUBLIC_IP:8931"
echo "📊 CloudWatch Logs: /ecs/playwright-server"
```

## ✅ Passo 14: Testar a Aplicação

```bash
# Testar endpoint de health
curl http://$PUBLIC_IP:8931/health

# Se funcionar, você verá uma resposta JSON
```

## 📋 Comandos Úteis Pós-Deploy

### Ver logs em tempo real:
```bash
aws logs tail /ecs/playwright-server --follow --region $AWS_REGION
```

### Status do service:
```bash
aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --region $AWS_REGION
```

### Parar a aplicação:
```bash
aws ecs update-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --desired-count 0 --region $AWS_REGION
```

### Reiniciar a aplicação:
```bash
aws ecs update-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --desired-count 1 --region $AWS_REGION
```

### Atualizar secrets (se necessário):
```bash
aws ssm put-parameter --name '/playwright/PROXY_WS_ENDPOINT' --value 'seu_valor_real' --type SecureString --overwrite --region $AWS_REGION
aws ssm put-parameter --name '/playwright/PROXY_USERNAME' --value 'seu_valor_real' --type SecureString --overwrite --region $AWS_REGION
aws ssm put-parameter --name '/playwright/PROXY_PASSWORD' --value 'seu_valor_real' --type SecureString --overwrite --region $AWS_REGION
```

## 🧹 Limpeza (Para Remover Tudo)

Se quiser remover todos os recursos criados:

```bash
# Parar service
aws ecs update-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --desired-count 0 --region $AWS_REGION
aws ecs wait services-stable --cluster $CLUSTER_NAME --services $SERVICE_NAME --region $AWS_REGION

# Deletar service
aws ecs delete-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --region $AWS_REGION

# Deletar cluster
aws ecs delete-cluster --cluster $CLUSTER_NAME --region $AWS_REGION

# Deletar ECR repository
aws ecr delete-repository --repository-name $ECR_REPO_NAME --force --region $AWS_REGION

# Deletar log group
aws logs delete-log-group --log-group-name /ecs/playwright-server --region $AWS_REGION

# Deletar security group
aws ec2 delete-security-group --group-id $SG_ID --region $AWS_REGION

# Deletar parâmetros SSM
aws ssm delete-parameter --name '/playwright/PROXY_WS_ENDPOINT' --region $AWS_REGION
aws ssm delete-parameter --name '/playwright/PROXY_USERNAME' --region $AWS_REGION
aws ssm delete-parameter --name '/playwright/PROXY_PASSWORD' --region $AWS_REGION
```

---

💡 **Dica**: Execute comando por comando e aguarde cada um terminar antes de seguir para o próximo! 

## 🔒 **Passo Extra: Criar IAM Role de Execução**

Execute estes comandos antes de continuar:

### 1. Criar a Trust Policy (arquivo temporário):
```bash
cat << 'EOF' > ecs-task-execution-trust-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
```

### 2. Criar a IAM Role:
```bash
aws iam create-role \
    --role-name ecsTaskExecutionRole \
    --assume-role-policy-document file://ecs-task-execution-trust-policy.json \
    --region $AWS_REGION
```

### 3. Anexar as políticas necessárias:
```bash
# Política padrão do ECS
aws iam attach-role-policy \
    --role-name ecsTaskExecutionRole \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy \
    --region $AWS_REGION

# Política para acessar SSM Parameter Store
aws iam attach-role-policy \
    --role-name ecsTaskExecutionRole \
    --policy-arn arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess \
    --region $AWS_REGION
```

### 4. Aguardar propagação (15 segundos):
```bash
echo "Aguardando propagação da role..."
sleep 15
echo "✅ Role criada!"
```

### 5. Limpar arquivo temporário:
```bash
rm ecs-task-execution-trust-policy.json
```

### 6. Atualizar o task-definition.json:
```bash
# Criar task definition com a execution role
sed -e "s/REGION/$AWS_REGION/g" \
    -e "s/ACCOUNT_ID/$AWS_ACCOUNT_ID/g" \
    -e "s|joaquimbreno/playwright-server-amd64:latest|$DOCKER_TAG|g" \
    task-definition.json > task-definition-temp.json

# Adicionar executionRoleArn no JSON
cat task-definition-temp.json | jq --arg roleArn "arn:aws:iam::$AWS_ACCOUNT_ID:role/ecsTaskExecutionRole" '. + {executionRoleArn: $roleArn}' > task-definition-updated.json

# Limpar arquivo temporário
rm task-definition-temp.json
```

### 7. Agora registrar a task definition (novamente):
```bash
aws ecs register-task-definition \
    --cli-input-json file://task-definition-updated.json \
    --region $AWS_REGION

# Limpar arquivo temporário
rm task-definition-updated.json

echo "✅ Task Definition registrada com sucesso!"
```

---

## 🎯 **O que fizemos:**

✅ **Criamos uma IAM Role** (`ecsTaskExecutionRole`)  
✅ **Adicionamos permissões** para ECS e SSM  
✅ **Atualizamos o task definition** com a role  
✅ **Registramos a task definition** corretamente  

Agora você pode **continuar com o Passo 9** (Configurar Rede) do guia! 🚀 