---
layout: post
title:  "Socket编程说起"
date:   2019-4-17
categories: Network
---
* TOC
{:toc}


![](https://img.shields.io/badge/LWebServer-%E5%89%8D%E8%A8%80-yellow.svg)

[关于专栏----WebServer二三事](https://blog.csdn.net/define_LIN/article/details/89040929)

&emsp;&emsp;在现代网络应用程序所使用的两种主流的体系结构： **客户机/服务器体系结构(CS)** 和**对等体系结构(P2P)** 中，**Web应用程序**属于典型的CS架构。这个相信大家都了解，而平时我们进行的服务端编程，大多数程序员习惯于使用较高层次的组件，框架，中间件等，使用便捷，能快速的完成功能点开发效率高，这些框架的使用使我们的开发变得简单，我们只需专注于业务，毋庸置疑是事半功倍的做法。

&emsp;&emsp;但是在学习计算机网络，操作系统等原理性课程时总感觉和在开发过程所学的框架知识总存在着飘忽不定的隔阂------**连贯不起来！**

&emsp;&emsp;而这些问题的源头就是，框架/组件为我们"做"了太多事情，这不是不好，相反这大大解放了工作量，但是我们却也失去了对一些底层概念的理解，**网络通信原理**或者是**IO交互过程**等，

&emsp;&emsp;**如何连贯？**，我认为理解通信原理很关键，所以我通过实现简单服务器，去了解通信细节，协议，高性能原理，而这些底层内容对于框架和语言来说是通用的，所以对我学习框架或者是语言也是降维打击。

&emsp;&emsp;学习网络通信就不得不说到**Socket编程**。

---
![](https://img.shields.io/badge/LWebServer-Socket-yellow.svg)

&emsp;&emsp;首先得了解网络应用程序进行通信的是**进程**而非程序，在**TCP/IP参考模型**中

![在这里插入图片描述](https://img-blog.csdnimg.cn/20190415232851368.png#pic_center =512x384)
不同的端系统上的进程通过跨越计算机网络交换**报文**(message)而实现相互通信。
而具体的跨越过程这里不做详细探讨，可以通过[计算机网络至顶向下方法](https://book.douban.com/subject/26176870/)这本书进行详细了解。

---
### 客户机进程和服务器进程

&emsp;&emsp;对于Web应用来说，进程间的通信存在于**客户机**和**服务器**之间，进程简单理解为运行在端系统的程序，而客户机进程比较常见的就是浏览器，而服务器进程为Web服务器，比如Apache，Nginx，Tomcat等，

**那我们写的WebApp在这里面充当什么角色？**

&emsp;&emsp;这里就体现前面说的，我们写的Web程序是基于一些组件框架或者中间件上建立的，其中复杂的通信原理被Web服务器封装，拿Tomcat来说，作为Servlet和JSP的容器，它负责接收HTTP请求，并把请求转送给对应的Servlet，然后Servlet将处理好的结果(响应)传回Tomcat，由Tomcat响应到**客户机**。我们开发的时候不用关心浏览器是如何和我们的Web程序建立TCP连接，协议如何解析。[Java Web之Servlet的创建和详细原理](https://blog.csdn.net/define_LIN/article/details/85223322)

&emsp;&emsp;Web服务器通过对**套接字(Socket)** 的封装实现进程间的通信，使我们在应用程序编程时不感知套接字层。

![](https://img-blog.csdnimg.cn/20190416085509895.png#pic_center =717x404)

&emsp;&emsp;上图可以看出操作系统通过提供Socket来为进程提供通信能力，而大多数应用端程序是基于通用组件编程，Socket层相对来说是透明的，但是在构建高性能应用程序时我们不得不去设置组件参数，优化组件性能，甚至是实现某个满足我们需求的特定组件，这时对底层通信接口的理解就变得十分重要了。

----
### 进程与计算机网络间的接口 ----------------Socket

&emsp;&emsp;网络通信是进程间报文传输的过程，从一个进程向另一个进程发送报文必须通过下面的网络，进程通过操作系统提供的称为**套接字(Socket)** 的软件接口在网络上接收和发送报文。**其实是进程间通信的抽象机制**，
<font color=red>这里暂时不讨论它在不同的操作系统的具体实现(在后续深入理解文件描述符时探讨)。</font>
![在这里插入图片描述](https://img-blog.csdnimg.cn/20190416094442635.png#pic_center)

&emsp;&emsp;如图所示，Socket是同一台主机内应用层与传输层之间的接口，也可以将Socket称为应用程序和网络之间的**应用程序编程接口(API)** ,应用程序开发者可以控制Socket在应用层端的所有东西，而对该Socket的传输层端的控制却仅限于：

 - 选择传输层协议；
 - 设定几个传输层参数，如最大缓存，最大报文长度MSS等。

---
### Socket相关系统调用

&emsp;&emsp;这里主要是记录Linux下的Socket的系统调用函数，各种OS下其实都大同小异，其实JDK中为我们提供的函数，也是基于这些系统调用(syscall)的封装。
 - `socket()`

&emsp;&emsp;socket()用于创建一个**socket描述符（socket descriptor）**，它唯一标识一个socket。这个socket描述字跟文件描述字一样，后续的操作都有用到它，把它作为参数，通过它来进行一些读写操作。
```
int socket(int domain, int type, int protocol);
```

&emsp;&emsp;创建socket的时候，也可以指定不同的参数创建不同的socket描述符，socket函数的三个参数分别为：

>**domain：** 即协议域，又称为协议族（family）。常用的协议族有，AF_INET、AF_INET6、AF_LOCAL（或称AF_UNIX，Unix域socket）、AF_ROUTE等等。协议族决定了socket的地址类型，在通信中必须采用对应的地址，如**AF_INET决定了要用ipv4地址（32位的）与端口号（16位的）的组合**、AF_UNIX决定了要用一个**绝对路径名**作为地址。

>**type：** 指定socket类型。常用的socket类型有，SOCK_STREAM(流式)、SOCK_DGRAM(数据报)、SOCK_RAW(原始)、SOCK_PACKET、SOCK_SEQPACKET等等。

>**protocol：** 故名思意，就是指定协议。常用的协议有，IPPROTO_TCP、IPPTOTO_UDP、IPPROTO_SCTP、IPPROTO_TIPC等，它们分别对应TCP传输协议、UDP传输协议、STCP传输协议、TIPC传输协议。

<font color=blue>注意：</font>

&emsp;&emsp;1)上面的type和protocol不可以随意组合的，如TCP协议(IPPROTO_TCP)对应的流式Scoket(SOCK_STREAM)，UDP协议(IPPTOTO_UDP)对应数据报式Socket(SOCK_DGRAM);

&emsp;&emsp;2)当protocol为0时，会自动选择type类型对应的默认协议;

&emsp;&emsp;3)Web程序大多采用TCP/IP协议族，`domain = AF_INET`。

当我们调用 socket 创建一个socket时，没有一个具体的地址。如果想要给它赋值一个地址，就必须调用bind()函数。

---
 - `bind()`

&emsp;&emsp;**bind()** 函数把一个地址族中的特定地址赋给socket。例如对AF_INET、AF_INET6就是把一个ipv4或ipv6地址和端口号组合赋给socket。

```
int bind(int sockfd, const struct sockaddr *addr, socklen_t addrlen);
```
函数的三个参数分别为：

>**sockfd：** 即socket描述字，它是通过socket()函数创建了，唯一标识一个socket。bind()函数就是将给这个描述字绑定一个名字。

>**addr：** 一个const struct sockaddr *指针，指向要绑定给sockfd的协议地址。这个地址结构根据地址创建socket时的地址协议族的不同而不同，如ipv4对应的是：
```
struct sockaddr_in {
    sa_family_t    sin_family; /* address family: AF_INET  协议族*/
    in_port_t      sin_port;   /* port in network byte order 端口  */
    struct in_addr sin_addr;   /* internet address  IP地址*/
};
/* Internet address. */
struct in_addr {
    uint32_t       s_addr;     /* address in network byte order */
};
```

>ipv6对应的是： 

```
struct sockaddr_in6 { 
        sa_family_t     sin6_family;   /* AF_INET6 */ 
        in_port_t       sin6_port;     /* port number */ 
        uint32_t        sin6_flowinfo; /* IPv6 flow information */ 
        struct in6_addr sin6_addr;     /* IPv6 address */ 
        uint32_t        sin6_scope_id; /* Scope ID (new in 2.4) */ 
    };
    struct in6_addr { 
        unsigned char   s6_addr[16];   /* IPv6 address */ 
    };
```
>Unix域对应的是： 

```
#define UNIX_PATH_MAX    108

struct sockaddr_un { 
    sa_family_t sun_family;               /* AF_UNIX */ 
    char        sun_path[UNIX_PATH_MAX];  /* pathname */ 
};
```

<font color=blue>注意：</font>

**地址绑定问题：**

&emsp;&emsp;1)通常服务器在启动的时候都会绑定一个众所周知的地址（如ip地址+端口号），用于提供服务，客户就可以通过它来接连服务器；而客户端就不用指定，有系统自动分配一个端口号和自身的ip地址组合。这就是为什么通常服务器端在listen之前会调用`bind()`，而客户端就不会调用，而是在`connect()`时由系统随机生成一个。

&emsp;&emsp;2)当服务器绑定IP地址时会遇到，本地多个IP地址的情况，这时候可以使用**地址通配符：INADDR_ANY**指定地址为0.0.0.0的地址，表示对一个服务器上所有的网卡（服务器可能不止一个网卡）多个本地ip地址都进行绑定端口号，进行侦听。

**网络字节序与主机字节序问题：**

a)**大端**（Big-Endian）高位字节排放在内存的低地址端；

b)**小端**（Little-Endian）低位字节排放在内存的低地址端；

&emsp;&emsp;1)**主机字节序**：不同的CPU有着不同的字节序类型，这些字节序是指整数在内存中的保存顺序，分为：**大端**（Big-Endian）和**小端**（Little-Endian）；

&emsp;&emsp;2) **网络字节序**：TCP/IP统一采用大端的方式传送数据，所以常把大端方式称为网络字节序；

&emsp;&emsp;3) 由于C/C++不跨平台，所以程序存储顺序跟编译平台所在的CPU相关，所以将一个地址绑定到Socket的时候需要将主机字节序转化为网络字节序，尽管主机字节序可能也采用的是大端的方式。

&emsp;&emsp;4) Java跨平台统一采用的是大端所以不存在字节序问题。

---
 - `listen()`，`connect()`和`accept()`函数
 
如果作为一个服务器，在调用socket()、bind()之后就会调用`listen()`来监听这个socket，如果客户端这时调用`connect()`发出连接请求，服务器端就会接收`accept()`到这个请求。

```
int listen(int sockfd, int backlog);
```

&emsp;&emsp;**sockfd**参数即为要监听的socket描述字；

<font color=blue>注意：</font>

&emsp;&emsp;**backlog**参数现在可以暂时简单理解为socket可以排队的最大连接个数。单独拎出来的意思是这个参数非常重要，对于性能的优化来说是非常重要的参数，影响着服务器的处理效率和丢包率，其实这个参数的大小由系统配置参数和我们传入参数取二者的最小值确定。

&emsp;&emsp;**在Linux中名称带backlog的参数有好几个：**

`net.core.somaxconn`,//全连接队列大小

`net.ipv4.tcp_max_syn_backlog`,//半连接队列大小

`net.core.netdev_max_backlog`,//网络接口比内核处理数据快时的最大缓存队列

&emsp;&emsp;**这里我们输入的参数backlog和`net.core.somaxconn`全连接队列取最小值作为最终的全连接队列大小。**

<font color=red>&emsp;&emsp;backlog还有许多可以详细说的地方，这里由于不是本文的核心内容就暂不细述，以后补充。</font>

---

&emsp;&emsp;在服务端我们用`listen()`函数监听客户机请求，而在客户机我们用`connect`函数发起对服务端的请求。
```
int connect(int sockfd, const struct sockaddr *addr, socklen_t addrlen);
```
`sockfd`参数即为客户端的socket描述字，

`addr`参数为服务器的socket地址，

`addrlen`参数为socket地址的长度。

**TCP客户端通过调用connect函数来建立与TCP服务器的连接，而UDP客户端调用用来指定服务器地址。**

---
 - `accept()`

TCP服务器端依次调用socket()、bind()、listen()之后，就会监听指定的socket地址了。TCP客户端依次调用socket()、connect()之后就想TCP服务器发送了一个连接请求。TCP服务器监听到这个请求之后，就会调用accept()函数取接收请求，这样连接就建立好了。之后就可以开始网络I/O操作了，即类同于普通文件的读写I/O操作。

```
int accept(int sockfd, struct sockaddr *addr, socklen_t *addrlen);
```
`sockfd`参数为服务器的socket描述字，
`addr`参数为指向struct sockaddr *的指针，用于返回**客户端**的协议地址，
`addrlen`参数为协议地址的长度。

&emsp;&emsp;如果accpet成功，那么其返回值是由内核自动生成的一个全新的描述字，代表与返回客户的TCP连接。

<font color=blue>注意：</font>

&emsp;&emsp;1）accept的第一个参数为服务器的socket描述字，是服务器开始调用socket()函数生成的，称为监听Socket描述符；而accept函数返回的是已连接的Socket描述符。

&emsp;&emsp;2）accept本质上是从前面说到的内核的全连接队列(backlog)取排在最前面的一个连接请求。

&emsp;&emsp;3）我个人喜欢将监听Socket称为**服务端Socket**(ServerSocket)，通过这个ServerSocket调用accept获得的客户机请求得到的Socket为**客户机Socket**(ClientSocket)。二者存在较大区别，就生命周期而言，服务器可能存在一个或者多个**ServerSocket**，它们在该服务器的生命周期里一直存在，而**ClientSocket**的生命周期较短但取决于多种因素，HTTP协议的短连接和长连接(**keep-alive**)，TCP的keepalive，服务器或者客户机的心跳保活机制等。例如短连接，在完成连接建立后，客户机发送请求，服务器响应请求立即调用`close()`关闭TCP连接。

&emsp;&emsp;<font color=red>连接保活的实现是一件有趣的事，如果细致了解就偏离话题了，还是暂时留个坑，以后补充</font>

&emsp;&emsp;4）在Java的各种IO模式下，会发现ServerSocket和ClientSocket，会被封装成好几种形式。

```
+------------+-------------+--------------------+--------------------------------+
|            |             |                    |                                |
|            |    BIO      |       NIO          |           AIO                  |
+--------------------------------------------------------------------------------+
|            |             |                    |                                |
|ServerSocket| ServerSocket| ServerSocketChannel| AsynchronousServerSocketChannel|
|            |             |                    |                                |
+--------------------------------------------------------------------------------+
|            |             |                    |                                |
|ClientSocket| Socket      | SocketChannel      | AsynchronousSocketChannel      |
|            |             |                    |                                |
+------------+-------------+--------------------+--------------------------------+

```

---

 - `read()`，`write()`等函数 
&emsp;&emsp;到这连接已经建立，接下来要做的就是读写数据了，这就实现了不同主机间进程的通信！下面来看几个IO操作的函数：

1）`read()`/`write()`

```
       ssize_t read(int fd, void *buf, size_t count);
       ssize_t write(int fd, const void *buf, size_t count);
```
>&emsp;&emsp;**read函数**是负责从fd中读取内容.当读成功时，read返回实际所读的字节数，如果返回的值是0表示已经读到文件的结束了，小于0表示出现了错误。如果错误为EINTR说明读是由中断引起的，如果是ECONNREST表示网络连接出了问题。

>&emsp;&emsp;**write函数**将buf中的nbytes字节内容写入文件描述符fd.成功时返回写的字节数。失败时返回-1，并设置errno变量。 在网络程序中，当我们向套接字文件描述符写时有俩种可能。
>
>1)write的返回值大于0，表示写了部分或者是全部的数据。
>
>2)返回的值小于0，此时出现了错误。我们要根据错误类型来处理。如果错误为EINTR表示在写的时候出现了中断错误。如果为EPIPE表示网络连接出现了问题(对方已经关闭了连接)。

2）`send()`/`sendto()`

```
       ssize_t send(int sockfd, const void *buf, size_t len, int flags);
       ssize_t sendto(int sockfd, const void *buf, size_t len, int flags,
                      const struct sockaddr *dest_addr, socklen_t addrlen);
```

&emsp;&emsp;**send()** 用于两个TCP Socket之间(基于TCP协议的Server和Clinet)发送数据，或用于调用了connect函数(已经指定了服务器地址)的UDP clinet socket 向服务器发送数据；

&emsp;&emsp;**sendto()** 用于UDP server socket ，或未调用connect的UDP clinet socket

&emsp;&emsp; 二者的区别，源于传输层协议的不同，**面向连接的TCP**，我们通过connect函数来建立连接，我们只需要调用`send()`和`recv()`就可以接收和发送数据，而不用指定接收方的地址；而**无连接的UDP**,我们每一次发送和接收都必须提供目标方的地址，即需要调用指定地址的方法：`sendto()`和`recvfrom()`，如果客户机不想每一次都向指定服务器的地址，因为服务器的地址一般是固定的，我们也可以调用connect函数指定服务器地址，相对于建立了一个类似于TCP的连接，也就可以通过`send()`和`recv()`来进行操作了。

3）`recv()`/`recvfrom()`

```
      ssize_t recv(int sockfd, void *buf, size_t len, int flags);
      ssize_t recvfrom(int sockfd, void *buf, size_t len, int flags,
                        struct sockaddr *src_addr, socklen_t *addrlen);
```

4）`recvmsg()`/`sendmsg()`

```
       ssize_t sendmsg(int sockfd, const struct msghdr *msg, int flags);
       ssize_t recvmsg(int sockfd, struct msghdr *msg, int flags);
```

&emsp;&emsp; 是前面1）2）3）的替代方法，只要设置好参数，read、readv、recv、recvfrom和write、writev、send、sendto等函数都可以对应换成这两个函数来调用。

---

 - `close()`

```
       int close(int fd);
```

&emsp;&emsp; 关闭Socket，close操作只是使相应socket描述字的引用计数-1，只有当引用计数为0的时候，才会触发TCP客户端向服务器发送终止连接请求。

---

### TCP连接流程图
![在这里插入图片描述](https://img-blog.csdnimg.cn/20190417203059788.png#pic_center)

&emsp;&emsp; 上图是简单的"一问一答"的服务器，前面聊的各种函数一目了然，可以细细品味其中过程。而我们这里关注以下几点：

<font color=blue>注意：</font>

**解析服务端IP地址(DNS查询)：**

客户机在调用connect方法连接服务器时，可能使用域名或者IP地址来标识Server，且IP地址需要使用32位二进制IP地址

1）如使用IP地址来标识，则需要点分十进制到2位二进制IP地址的转换，同时端口号也要转化为网络字节序：

```
servAddr.sin_addr.s_addr = inet_addr("127.0.0.1");
servAddr.sin_port = htons((short)4999);
```
servAddr为SOCKADDR_IN ，在地址结构体

2）如果使用域名来标识就必须进行DNS查询到IP地址

```
hostent *host = gethostbyname("ueditor.baidu.com");
```
返回一个指向结构hostent的指针，包含已为网络字节顺序的IP地址。

**初探阻塞：**

&emsp;&emsp;<font color=red> 我认为在整个IO模式的学习过程中，对**阻塞和非阻塞**，**异步和同步**，理解非常非常的重要！可以说是贯穿整个知识体系，是一个渐进的由浅到深的过程！这里是对阻塞的一个初印象，例如netty的书籍也大多是从阻塞IO和非阻塞IO的区别开始讲起的，重要性可见一斑。</font>

&emsp;&emsp;当前理解阻塞是程序在调用这个函数时，如果函数结果没有返回，线程会被挂起(卡在哪里)。

&emsp;&emsp;则在上图中对于客户机来说阻塞函数有：`connect()`和`recv()`；`connect()`方法会等待TCP连接的建立而`recv()`会等待数据的到达。

&emsp;&emsp;服务端的阻塞函数有：`accept()`和`recv()`；`accept()`函数阻塞等待队列中有完整连接。

&emsp;&emsp;其实各种高性能IO模式无论是**IO多路复用(NIO)** 还是不同操作系统下实现的 **异步IO(AIO)** 都是在围绕**阻塞/非阻塞**，**同步/异步**做文章，轮询，回调，内存映射，无所不用其极！

![](https://img.shields.io/badge/LWebServer-TCP%E8%BF%9E%E6%8E%A5%E5%BB%BA%E7%AB%8B-yellow.svg)


### [TCP连接建立过程------从完整的抓包数据来理解TCP三次握手四次挥手和数据传输过程](https://blog.csdn.net/define_LIN/article/details/88758286)

![](https://img.shields.io/badge/LWebServer-%E6%9C%80%E5%90%8E-yellow.svg)
### 总结

&emsp;&emsp;整篇博文围绕着Socket展开，首先介绍了Socket编程，然后了解了API，并且在过程中做了很多的扩展，如backlog，Java中socket的类型，阻塞/非阻塞等，最后是TCP连接建立流程。

&emsp;&emsp;文章花了我很长时间，也在里面也给自己留了很多待填补的坑(红字部分)，都是一些十分重要的内容。接下来会逐渐完善。

&emsp;&emsp;学习Socket编程是一种降维打击，操作系统提供的API经久不变，而我们使用的组件大多是对其的封装，了解其原理，对于我们选择，配置组件有巨大帮助！

>参考：
>
>[计算机网络至顶向下方法](https://book.douban.com/subject/26176870/)
>
>[UNIX Network Programming ](http://www.unpbook.com/)
>
>[高性能网络编程（一）—-ACCEPT建立连接](http://www.taohui.pub/2016/01/25/%E9%AB%98%E6%80%A7%E8%83%BD%E7%BD%91%E7%BB%9C%E7%BC%96%E7%A8%8B%EF%BC%88%E4%B8%80%EF%BC%89-accept%E5%BB%BA%E7%AB%8B%E8%BF%9E%E6%8E%A5/#comment-161)
>
>[字节序](https://www.cnblogs.com/Romi/archive/2012/01/10/2318551.html)
