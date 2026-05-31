# 使用官方轻量级 Node 镜像
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 复制 package.json
COPY package*.json ./

# 安装生产环境依赖 (此处虽无外部依赖，但符合标准规范)
RUN npm install --omit=dev

# 复制所有项目文件
COPY . .

# Render 默认使用 PORT 环境变量，通常是 10000 或 8080
ENV PORT=8080
EXPOSE 8080

# 启动服务
CMD ["npm", "start"]
