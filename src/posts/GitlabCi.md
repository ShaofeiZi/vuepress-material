---
title: 基于GitLab 的 CI 实践 (docker)
date: 2018-07-24 21:15:53
tags: [gitlab,ci,docker]
---
# GitlabCi
基于GitLab 的 CI 实践。分享内容以 GitLab Community Edition 11.0.4 edb037c 为例。
<!-- more -->
## 为何选择 GitLab CI

### 认识 GitLab CI

#### 什么是 GitLab CI

GitLab CI 是 GitLab 为了提升其在软件开发工程中作用，完善 DevOPS 理念所加入的 CI/CD 基础功能。可以便捷的融入软件开发环节中。通过 GitLab CI 可以定义完善的 CI/CD Pipeline。

#### 优势

* GitLab CI 是默认包含在 GitLab 中的，我们的代码使用 GitLab 进行托管，这样可以很容易的进行集成
* GitLab CI 的前端界面比较美观，容易被人接受
* 包含实时构建日志，容易追踪
* 采用 C/S 的架构，可方面的进行横向扩展，性能上不会有影响
* 使用 YAML 进行配置，任何人都可以很方便的使用。 

### 重点概念

#### Pipeline

Pipeline 相当于一个构建任务，里面可以包含多个流程，如依赖安装、编译、测试、部署等。
任何提交或者 Merge Request 的合并都可以触发 Pipeline

#### Stages

Stage 表示构建的阶段，即上面提到的流程.

- 所有 Stages 按顺序执行，即当一个 Stage 完成后，下一个 Stage 才会开始
- 任一 Stage 失败，后面的 Stages 将永不会执行，Pipeline 失败
- 只有当所有 Stages 完成后，Pipeline 才会成功

#### Jobs

Job 是 Stage 中的任务.

- 相同 Stage 中的 Jobs 会并行执行
- 任一 Job 失败，那么 Stage 失败，Pipeline 失败
- 相同 Stage 中的 Jobs 都执行成功时，该 Stage 成功

好的，基本的概念已经和大家介绍了， 大家可以发现，上面说的概念，没有提到任务的实际执行者. 那任务在哪里执行呢？
### GitLab runner

Runner 是任务的实际执行者， 可以在 MacOS/Linux/Windows 等系统上运行。使用 golang 进行开发。 同时也可部署在 k8s 上

上面的示例为将 runner 注册为一个容器， 当然 大家也可以直接在物理机上执行。 在物理机上的注册方式与注册为容器大致相同
```
sudo gitlab-runner register \
  --non-interactive \
  --url "https://gitlab.com/" \
  --registration-token "PROJECT_REGISTRATION_TOKEN" \
  --executor "docker" \
  --docker-image alpine:3 \
  --description "docker-runner" \
  --tag-list "docker,aws" \
  --run-untagged \
  --locked="false" \
（这段代码来自官方文档）
```
接下来，我们来看下 runner 的类型， 以便在使用时进行区分。 
#### 类型

- Shared - Runner runs jobs from all unassigned projects
- Group - Runner runs jobs from all unassigned projects in its group
- Specific - Runner runs jobs from assigned projects
- Locked - Runner cannot be assigned to other projects
- Paused - Runner will not receive any new jobs
大家在项目的 settings-- CI/CD -- Runners settings  即可查看

当注册完成后，我们可以看下runner 的配置。 
```
sudo docker exec -it gitlab-runner /bin/sh
cat /etc/gitlab-runner/config.toml
```
首先最外层的是全局配置， 默认会有 
concurrent = 1
check_interval = 0
这两个。 比较需要关注的是下面几个 
##### 全局配置

concurrent: 并发数, 0 为无限制
sentry_dsn：与 Sentry 联动，可以将异常等收集至 Sentry 中。
listen_address: 暴露出 metrics 供 Prometheus 监控

接下来是 runner 的配置部分， 里面涉及的概念，我们先来了解一下。 

#### Executor 

- Shell
- Docker (本次的分享内容)
- Docker Machine and Docker Machine SSH (autoscaling)
- Parallels
- VirtualBox
- SSH
- Kubernetes (推荐)

可以看到， 我们刚才将 runner 注册为了一个 docker 容器， 而现在选择 executor 为 Docker ， 那是什么意思呢？ 这意味着 我们在 Docker 里面启动另外的 Docker 容器，即 Docker In Docker 
### 概述

Docker In Docker 简称 dind，在 GitLab CI 的使用中，可能会常被用于 service 的部分。 dind 表示在 Docker 中实际运行了一个 Docker 容器, 或 Docker daemon。

其实如果只是在 Docker 中执行 docker 命令， 那装个二进制文件即可。 但是如果想要运行 Docker daemon (比如需要执行 docker info)或者访问任意的设备都是不允许的。

Docker 在 run 命令中提供了两个很重要的选项 --privileged 和 --device ， 另外的选项比如 --cap-add 和 --cap-drop 跟权限也很相关，不过不是今天的重点，按下不表。

--device 选项可以供我们在不使用 --privileged 选项时，访问到指定设备, 比如 docker run --device=/dev/sda:/dev/xvdc --rm -it ubuntu fdisk  /dev/xvdc 但是这也只是有限的权限， 我们知道 docker 的技术实现其实是基于 cgroup 的资源隔离，而 --device 却不足于让我们在容器内有足够的权限来完成 docker daemon 的启动。

在 2013年 左右， --privileged 选项被加入 docker， 这让我们在容器内启动容器变成了可能。 虽然 --privileged 的初始想法是为了能让容器开发更加便利，不过有些人在使用的时候，其实可能有些误解。

有时候，我们可能只是想要能够在容器内正常的build 镜像，或者是与 Docker daemon 进行交互，例如 docker images 等命令。 那么，我们其实不需要 dind， 我们需要的是 Docker Out Of Docker，即 dood，在使用的时候，其实是将 docker.sock 挂载入容器内

例如， 使用如下命令： 
```
sudo docker run --rm -ti -v /var/run/docker.sock:/var/run/docker.sock taobeier/docker /bin/sh  
```
在容器内可进行正常的docker images 等操作， 同时需要注意，在容器内的动作，将影响到 宿主机上的 docker daemon

关于 dood 的部分，我们先说这么多，我们回到 dind 中， 看下如何实现

### 如何实现

* 创建组和用户，并将用户加入该组。 使用 groupadd 和 useradd 命令
* 更新 subuid 和 subgid 文件， 将新用户和组配置到 /etc/subgid 和 /etc/subuid 文件中。 subuid 和 subgid 规定了允许用户使用的从属id
* 接下来需要挂载 /sys/kernel/security 为 securityfs 类型可以使用 mountpoint 命令进行测试 mountpoint /sys/kernel/security 如果不是一个挂载点， 那么使用 mount -t securityfs none /sys/kernel/security 进行挂载。如果没有挂载成功的话， 可以检查是否是 SELinux 或者 AppArmor 阻止了这个行为。这里详细的安全问题，可以参考 Linux Security Modules (LSM)
* 接下来允许 dockerd 命令启动 daemon 即可， dockerd --host=unix:///var/run/docker.sock --host=tcp://0.0.0.0:2375 即可将docker daemon 监听至 2375 端口

以上的实现方式，可能会觉得有些复杂， 那么我们可以使用更加简单的办法 

### 简单做法

可以直接使用 Docker 官方镜像仓库中的 docker:dind 镜像, 但是在运行时， 需要指定 --privileged 选项

简单来说，只要 
```
sudo docker run --rm -ti --privileged  taobeier/docker:stable-dind /bin/sh
```
即可实现 dind 了， 进入镜像内， 执行 dockerd 即可看到效果  

接下来，我们进入到 CI 实践的部分。 还是要继续看下runner 的配置 
```
[[runners]]
  name = "docker"
  url = "https://gitlab.example.com/"
  token = "TOKEN"
  limit = 0
  executor = "docker"
  builds_dir = ""
  shell = ""
  environment = ["ENV=value", "LC_ALL=en_US.UTF-8"]
  clone_url = "http://172.17.0.4"
```
由于网络原因， clone_url 可以配置为可访问的地址，这样代码 clone 的时候，将会使用配置的这个地址。实际请求为 
> http://gitlab-ci-token:TOKEN@172.17.0.4/namespace/project.git

这个使用场景，在私有 gitlab 域名未解析的情况会比较有用 （当然 我之前确实遇到了这个情况）


* 再看一下 runners.docker 的配置，这部分将影响 docker 的实际运行
```
[runners.docker]
  host = ""
  hostname = ""
  tls_cert_path = "/home/tao/certs"
  image = "docker"
  dns = ["8.8.8.8"]
  privileged = false
  userns_mode = "host"
  devices = ["/dev/net/tun"]
  disable_cache = false
  wait_for_services_timeout = 30
  cache_dir = ""
  volumes = ["/data", "/home/project/cache"]
  extra_hosts = ["other-host:127.0.0.1"]
  services = ["mongo", "redis:3"]
  allowed_images = ["go:*", "python:*", "java:*"]
```

dns, privileged, extra_hosts, services 比较关键， 尤其是在生产中网络情况多种多样， 需要格外关注。 至于 devices 配置 ，在今儿分享的一开始已经讲过了， allowed_images 的话， 是做了个限制。 
上面几个配置项， 用过 docker 的同学，应该很容易理解。 我们来看下 services 这个配置项 

如果使用了 dind 的方式， 大家可能会常常看到 有人在 .gitlab-ci.yml 中配置了 service: docker:dind , 那这是什么意思呢 

services 的本质其实是使用了 docker 的 --link ，我们来看下它在 docker executor下如何工作

### Docker Executor 如何工作

* 创建 service 容器 (已经配置在 service 中的镜像)
* 创建 cache 容器 (存储已经配置在 config.toml 的卷和构建镜像的 Dockerfile) 
* 创建 build 容器 并且 link 所有的 service 容器.
* 启动 build 容器 并且发送 job 脚本到该容器中.
* 执行 job 的脚本.
* 检出代码: /builds/group-name/project-name/.
* 执行 .gitlab-ci.yml 中定义的步骤.
* 检查脚本执行后的状态码，如果非 0 则构建失败.
* 移除 build 和 service 容器.

看到这里， 大家应该能明白， service 其实和我们在 docker-compose 里面定义的 services 类似， 也就是说， 不仅可以定义 docker:dind 还可以使用 mysql， redis 等

聊完了以上的部分后，我们来看下生产中，我们还会遇到的问题。 首先就是 我们通常会使用私有镜像仓库 

### 私有镜像源

用户认证需要 GitLab Runner 1.8 或更高版本，在 0.6 ~ 1.8 版本之间的 Runner 需要自行去 Runner 的机器上手动执行。

默认情况下，如果访问的镜像仓库需要认真的话， GitLab Runner 会使用 DOCKER_AUTH_CONFIG 变量的作为认证的凭证。

注意：DOCKER_AUTH_CONFIG 是完成的 docker auth 凭证，也就是说，它应该和我们 ~/.docker/config.json 中的内容一致，例如：
```
 {
     "auths": {
         "registry.example.com": {
             "auth": "5oiR5piv5byg5pmL5rab"
         }
     }
 }
```

简单的做法就是，我们在本地/服务器上执行 docker login 私有镜像源    登录成功后，将 ~/.docker/config.json 的文件内容直接复制，作为我们的变量的值 

或者是  echo -n '用户名:密码' |base64 以这样的方式来获得 auth 的内容，组装成对应的格式，写入 GitLab 的 value 配置中 

在生产环境中， CI 的耗时，我们当然是希望它可以尽可能的缩短， 那么我们除了上面 使用私有镜像源以外，我们还做了什么事情呢？ 

1. 构建自己的私有基础镜像 
因为网络的原因， 如果默认使用官方镜像，
    1. 官方镜像拉不下来
    2. 在官方镜像中安装包耗时长 
    3.  如果换源，需要每个 Dockerfile 都要做相同的事情。  这我们当然是不能同意的。 所以，我们构建了自己的私有镜像。 从busybox 开始 构建 alpine linux 使用私有源， 以此为基础 构建我们所需要的其他镜像。 用户不再需要自行换源
这个操作完成后， 原先我们需要在 ci 执行的过程中安装 py-pip (为了安装 docker-compose 和我们的服务依赖) 耗时从 3min30s 减少到了 18s

这里，需要说下为何我们是从头开始构建镜像，而不是基于官方镜像。  主要是为了减少镜像体积 以及为了更快的适用于我们的需求。  
同样的，我们构建了基础的 docker 镜像，python/maven 等镜像，都是默认使用了我们的私有源，并且，用户在使用时， 并不需要关注换源的事情， 减少用户的心智负担
接下来，我们在规范 Dockerfile 的编写。 减少不必要的依赖安装等，即减少网络耗时，也会缩小镜像体积

接下来的优化， 在于 job 的拆分， gitlab runner 可以使用tag 来使不同的runner 执行对应tag 下的job。 使用这种方式 可以便于分摊压力 

另外的优化，在于使用 cache 

CI 的构建中，大多数的镜像，其实变化不大，所以使用cache 可以成倍的提升 CI 的速度。  最后，分享一下 可能遇到的坑 

前面提到了 service 中可以使用各种各样的服务， 无论是 dind 还是 mysql redis 等。 但是 如果我们全部做到了优化，都使用我们的私有源， 那便会发现问题 

因为 gitlab ci 默认对于 docker:dind 的service  其实会选择连名为docker 的host ，以及 2375 端口。 当使用私有镜像源的时候，  比如 
```
services:
    - name: registry.docker-cn.com/taobeier/docker:stable-dind
```
 那这个service 的host 是什么呢？
这个service 的host 其实是会变成 registry.docker-cn.com__taobeier__docker ，然后 gitlab runner 便会找不到， job 就会执行失败

有两种解决办法。 一种是 加一个变量
```
variables:
  
  DOCKER_HOST: "tcp://registry.docker-cn.com__taobeier__docker:2375"
```

```
services:
    - name: registry.docker-cn.com/taobeier/docker:stable-dind
      alias: docker
```
加一个 alias 。 这个方法目前很少人在用， 毕竟网络上查到的都是第一种 ，但是这个方式却是最简单的

好了， 由于时间的关系，今儿就先分享这么多， CI 系统上能做的事情有很多， 优化方面能做的事情也不少。  感谢大家

Q&A
Q. 您提到 把各种依赖都以 service 的提供，请问是以哪种方式呢？  比如python的依赖，怎么做成service呢？
A： service 化的依赖，主要是指 类似 db / mysql/ reids 之类的。 或者是 dind 其实它提供的是 2375 端口的TCP服务。  Python 的依赖，我推荐的做法是， 构建一个 换了源的 Python 镜像。 安装依赖的时候，耗时会少很多。 或者说， 可以在定义 pipeline 的时候， 将虚拟环境的 venv 文件夹作为 cache ，之后的安装也会检查这个，避免不必要的安装。
