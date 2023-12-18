---
title: 开荒 01
date: 2023-12-19 12:30:32
tags: [nginx]
---
# 开荒第一天
## 买个服务器
正好阿里云有促销 [99一年](https://www.aliyun.com/lowcode/promotion/allinaliyun/99program)
>2核2G
>3M固定带宽
>40G ESSD Entry云盘。


<!-- more -->
## 安全组
先把安全组开了。

单击实例的ID，选择安全组页签，单击安全组操作列的配置规则，在入方向添加需要放行的端口

![](/images/20231219010827.png)

## 安装依赖
1. 密码重置。登入ECS.
2. 安装Nginx服务
```shell
yum update && yum -y install nginx
```
3. 启动Nginx。
```shell
systemctl start nginx
```
4. 测试Nginx。
直接访问 公网地址。能打开就OK
5. 修改配置

[贴个生成配置网站](https://www.digitalocean.com/community/tools/nginx?global.app.lang=zhCN)

创建一个新配置文件
```shell
vim /etc/nginx/conf.d/app.conf
```
```
server {
    listen 80 default_server; 
    server_name _;  # 可以换成域名 目前IP访问先这样

    location / {
        root /var/www/flyingChess/flyingChess;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
}
```
6. 保存退出 重启
```shell
nginx -s reload
```
静态网站OK





