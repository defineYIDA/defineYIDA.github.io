---
layout: post
title:  "WebServer二三事(二)五种网络I_O模式"
date:   2019-05-04
categories: WebServer二三事
---
* TOC
{:toc}

[关于专栏----WebServer二三事](https://blog.csdn.net/define_LIN/article/details/89040929)

![](https://img.shields.io/badge/LWebServer-%E6%A6%82%E8%BF%B0-red.svg)

&emsp;&emsp;(一) 本文参考 [UNIX 网络编程 卷一 第6章 I/O复用](https://library.tebyan.net/en/Viewer/Text/164873/92) ，在阅读这篇文章之前应该对 [Socket编程](https://blog.csdn.net/define_LIN/article/details/89304687) 的系列函数和连接的建立过程有一定的理解。

&emsp;&emsp;(二) 对I/O模式的讨论要建立在操作系统的基础上，相同I/O模式在不同的系统下有不同的实现。比如异步I/O的实现在Linux和window上的实现就存在很大区别。这篇文章讨论的环境为**Linux**下的I/O模型。

&emsp;&emsp;(三) **同步(synchronous)**/**异步(asynchronous)**,**阻塞(blocking)**/**非阻塞(non-blocking)** 的概念必须以<font color=red>具体的层级下的定义</font>为前提讨论才有可比性，本文对异步和同步采用**POSIX**中的定义：

* A synchronous I/O operation causes the requesting process to be blocked until that I/O operation completes;
* An asynchronous I/O operation does not cause the requesting process to be blocked;


&emsp;&emsp;(四) 对于一个网络I/O操作(read为例)通常涉及如下，

&emsp;&emsp;<font color=red>两个对象：</font>

 - 调用I/O操作的**进程(process)**或**线程(thread)**
 - **内核(kernel)**

&emsp;&emsp;<font color=red>两个阶段(两个阻塞过程)：</font>

 - 等待数据准备 (Waiting for the data to be ready)
 - 将数据从内核拷贝到进程中(Copying the data from the kernel to the process)

&emsp;&emsp;以上四点是理解I/O模式的关键。

---
![](https://img.shields.io/badge/LWebServer-I%2FO%E6%A8%A1%E5%BC%8F-red.svg)

&emsp;&emsp;UNIX下可用的5种I/O模式：

|I/O模式|同步/异步，阻塞/非阻塞  |
|--|--|
|<font color=red>阻塞式I/O模型 (blocking I/O)</font> |同步，阻塞  |
|<font color=red>非阻塞式I/O模型 (nonblocking I/O)</font> |同步，非阻塞  |
|<font color=red>I/O多路复用模型 (I/O multiplexing)</font> |同步，非阻塞  |
|<font color=red>信号驱动式I/O模型 (signal driven I/O)</font> |同步，非阻塞  |
|<font color=red>异步I/O模型 (asynchronous I/O)</font> |异步，非阻塞  |

![在这里插入图片描述](https://img-blog.csdnimg.cn/20190503100839932.png#pic_center)

&emsp;&emsp;在概述中提到网络I/O的两种阶段，对于一个Socket来说，如果一方要接收另一方的数据，

 - **第一阶段** 通常需要等待数据从网络中到达,当所有的分组到达是被复制到内核中的某个缓冲区(**内核态**)；
 - **第二阶段** 用户进程复制内核缓冲区中的对应数据到进程缓冲区(**用户态**)；
 
&emsp;&emsp;而对同步/异步，阻塞和非阻塞的讨论就是基于这两步进行的。

&emsp;&emsp;许多的文章都将阻塞和同步，异步和非阻塞混为一谈，将非阻塞等同于异步，认为I/O复用模式(select,poll,epoll)为异步，其实都是错误的，异步I/O只有使用了特殊的API才能实现，以至于在UNIX Network Programming 在将信号驱动I/O和异步I/O比较时，如下写道 ：
>As of this writing, few systems support POSIX asynchronous I/O. We are not certain, for example, if systems will support it for sockets. Our use of it here is as an example to compare against the signal-driven I/O model.


![](https://img-blog.csdnimg.cn/2019050100484537.png#pic_center)
 <div align = "center">特殊API实现异步I/O</div>
 
 &emsp;&emsp;支持满足**POSIX**定义的异步I/O的系统还是比较少的，其中Linux下的AIO还不是真正的异步，Windows下的                                     **IOCP**  才是基于Proactor设计的真正的异步接口，但是要注意，异步和高效并不等同。感兴趣的同学可以自行了解，这里就不多说了。
 
----
![](https://img.shields.io/badge/LWebServer-asyn%2Fsync-red.svg)

 &emsp;&emsp;更详细的对于同步/异步，阻塞/非阻塞的讨论参考：**[同步/异步，阻塞/非阻塞你真的理解了吗？](https://blog.csdn.net/define_LIN/article/details/89724421)**


---

![](https://img.shields.io/badge/LWebServer-I%2FO%E6%A8%A1%E5%BC%8F%E8%AF%A6%E6%83%85-red.svg)

&emsp;&emsp;下面来具体介绍如下5种I/O模式，我们使用UDP而不是TCP为例，原因在于数据准备好读取的概念比较简单，要么整个数据报已经收到，要么还没到，而对于TCP来说一些额外变量会复杂化这个过程。
### 阻塞式I/O模型 (blocking I/O)

![在这里插入图片描述](https://img-blog.csdnimg.cn/20190501011513802.png#pic_center)

&emsp;&emsp;当用户进程调用了recvfrom这个系统调用，kernel就开始了IO的第一个阶段：准备数据。对于Network I/O来说，很多时候数据一开始还没有到达（比如，还没有收到一个完整的UDP包），这个时候kernel就要等待足够的数据到来。而在用户进程这边，整个进程会被阻塞。当kernel一直等到数据准备好了，它就会将数据从kernel中拷贝到用户内存，然后kernel返回结果，用户进程才解除block的状态，重新运行起来。

&emsp;&emsp;所以，blocking IO的特点就是在<font color=red>IO执行的两个阶段（等待数据和拷贝数据两个阶段）都被block了</font>。

![在这里插入图片描述](https://img-blog.csdnimg.cn/20190503105100652.png#pic_center)

&emsp;&emsp;观察上图，结合前面一篇文章([WebServer二三事(一)Socket编程说起](https://blog.csdn.net/define_LIN/article/details/89304687))，在Socket的接口中有一些典型的阻塞型的接口，例如：listen()、send()、recv() 等接口，在这些接口返回期间进程是被挂起的不能执行任何操作。那么在这最原始的I/O模式中我们是怎样对其进行改进的呢？

&emsp;&emsp;一般而言我们会在服务端使用**多线程(进程)**，目的是当有客户机连接进来时(客户机调用`connect()`，服务器`accept()`)，将客户机连接的产生socket让一个独立线程(进程)处理,在服务器端我们将调用`accept()`的线程称为**监听线程**(或主线程)，而处理客户机连接的线程为**工作线程**，明显主线程负责"接客"，工作线程负责"干活"，而干活期间调用系列阻塞函数造成的block，只会造成当前工作线程的挂起，不会影响其他工作线程，更加不会影响主线程。其实Java中对IO多路复用(NIO)的实现也多采用类似的思想。

&emsp;&emsp;再观基于多线程的改良版的一问一答服务器：

![在这里插入图片描述](https://img-blog.csdnimg.cn/20190503110421395.png#pic_center)

<font color=red>基于多线程的改良阻塞式I/O模型的瓶颈：</font>

&emsp;&emsp;一切似乎都那么美好，一个客户机连接对应一个线程，大家各干各的，但是注意这只是在连接进来的请求数目较小的时候，当请求数成千上万时就显得力不从心了，首先大家(工作线程)只有一个妈(CPU)，任何操作还得CPU来执行，这里就涉及到线程的切换，线程越多就需要频繁线程切换花费大量时间，同时每个线程需要一个栈来保存数据，需要消耗大量的内存。

&emsp;&emsp;**线程池或连接池的作用：**
 - **线程池**旨在减少创建和销毁线程的频率，其维持一定合理数量的线程，并让空闲的线程重新承担新的执行任务。
 - **连接池**维持连接的缓存池，尽量重用已有的连接、减少创建和关闭连接的频率。
 
 &emsp;&emsp;这两种技术都可以很好的降低系统开销，都被广泛应用很多大型系统，如websphere、tomcat和各种数据库等。但是，“线程池”和“连接池”技术也只是在一定程度上缓解了资源消耗和CPU压力。
    
---
### 非阻塞式I/O模型 (nonblocking I/O)

Linux下，可以通过设置socket使其变为non-blocking。当对一个non-blocking socket执行读操作时，流程是这个样子：

![在这里插入图片描述](https://img-blog.csdnimg.cn/20190503114358329.png#pic_center)

&emsp;&emsp;将Socket设置为非阻塞：
 - C++
`bool SetBlock(int sock,bool isblock)`
 - Java
`SelectableChannel configureBlocking(boolean block)`

即是在通知内核：当该进程需要被挂起等待才能完成的时候，不要挂起该线程，而是返回一个错误。如上图前三次调用都是返回了一个EWOULDBLOCK的error，从用户进程的角度看，发起一个`recvfrom`后进程并未挂起，而是返回error，这时就知道数据还没有准备好，我们可以再次发起`recvfrom`，直到第四次调用，有数据报准备好了，则`recvfrom`成功返回，这样一个循环调用过程称之为**轮询(polling)**

&emsp;&emsp;**在非阻塞式I/O中，用户进程不断主动轮询kernel，查看操作是否就绪。** 基于非阻塞的模型的示意图：

![在这里插入图片描述](https://img-blog.csdnimg.cn/20190503225126378.png#pic_center)

&emsp;&emsp;回想之前对`recv()`接口的理解，发现之前的理解还是较浅，不能解释当前场景，例如返回值怎样标识是错误，网络连接关闭或者是数据还未就绪？阻塞/非阻塞对其返回的影响？

&emsp;&emsp;

#### 再看`recv()`函数：

&emsp;&emsp;`int recv( SOCKET s, char FAR *buf, int len, int flags);`

 - s 为指定的套接字描述符，其阻塞非阻塞状态影响函数的返回；
 - buf 指定缓冲区用来存放数据，即前面所说的处于用户态的缓存，是协议接收到的内核态数据的copy；
 - len buf长度
 
&emsp;&emsp;**执行流程：**

&emsp;&emsp;1）recv先等待s的发送缓冲中的数据被协议传送完毕，如果协议在传送s的发送缓冲中的数据时出现网络错误，那么recv函数返回SOCKET_ERROR；

&emsp;&emsp;2）如果s的发送缓冲中没有数据或者数据被协议成功发送完毕后，recv先检查套接字s的接收缓冲区，如果s接收缓冲区中没有数据或者协议正在接收数 据，那么阻塞socket的recv会一直等待，直到协议把数据接收完毕，而非阻塞socket会返回**error(<0)**。

&emsp;&emsp;3）当协议把数据接收完毕，recv函数就把s的接收缓冲中的数据copy到buf中,

&emsp;&emsp;<font color=red>阻塞与非阻塞recv返回值没有区分，都是 <0 出错 ；=0 连接关闭 ；>0 接收到数据大小，</font>

&emsp;&emsp;但是在**返回值<0时并且(errno == EINTR || errno == EWOULDBLOCK || errno == EAGAIN)的情况下认为连接是正常的，继续接收。即内核知道当前为非阻塞socket，返回errno为前面三种特定的类型区别于其他系统错误errno，也是告诉用户进程连接正常，只不过数据还未到达，需要继续轮询！**

&emsp;&emsp;而阻塞型socket返回值<0，或者errno不为前面的特定类型就代表出现系统错误了。

&emsp;&emsp;[更详细过程和更多errno值参考文章](https://blog.csdn.net/hnlyyk/article/details/51143256)

---

&emsp;&emsp;回到正题，如上图，服务器线程可以通过循环调用recv()接口，可以在单个线程内实现对所有连接的数据接收工作。但是上述模型绝不被推荐。因为，循环调用recv()将大幅度推高CPU 占用率；此外，在这个方案中recv()更多的是起到检测“操作是否完成”的作用，实际操作系统提供了更为高效的检测“操作是否完成“作用的接口，例如select()多路复用模式，可以一次检测多个连接是否活跃。

---
### I/O多路复用模型 (I/O multiplexing)

&emsp;&emsp;I/O multiplexing模式是目前服务器用得最多的一种I/O模式，类似于nonblocking I/O也是通过轮询的方式实现检测I/O操作是否完成，而轮询的执行由用户进程转换到了kernel，而用户进程只需要接收就绪的socket的即可，有三种实现：

&emsp;&emsp;**select，poll，epoll**  &emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;      <font color=red>具体实现将会在后续文章中深入了解</font>

&emsp;&emsp;流程图如下：

![在这里插入图片描述](https://img-blog.csdnimg.cn/20190504001959740.png#pic_center)

&emsp;&emsp;I/O multiplexing模式的特点是：<font color=red>在一个process里同时处理多个connection</font>.

&emsp;&emsp;当用户进程调用了select，那么整个进程会被block，而同时，kernel会“监视”所有select负责的socket，当任何一个socket中的数据准备好了，select就会返回。这个时候用户进程再调用read操作，将数据从kernel拷贝到用户进程。

&emsp;&emsp; 这个图和blocking IO的图其实并没有太大的不同，事实上还更差一些。因为这里需要使用两个系统调用(select和recvfrom)，而blocking IO只调用了一个系统调用(recvfrom)。但是，用select的优势在于它可以同时处理多个connection。（如果处理的连接数不是很高的话，使用select/epoll的web server不一定比使用multi-threading + blocking IO的web server性能更好，可能延迟还更大。select/epoll的优势并不是对于单个连接能处理得更快，而是在于能处理更多的连接。）

&emsp;&emsp; **在多路复用模型中，对于每一个Clientsocket(<font color=red>这里我只说是客户机连接进来的请求，而主的监听socket，有的时候会被设置为阻塞类型，例如Tomcat NIO模式的Acceptor线程中的监听socket就是阻塞类型</font>)，一般都设置成为non-blocking，但是，如上图所示，整个用户的process其实是一直被block的。只不过process是被select这个函数block，而不是被socket IO给block。因此select()与非阻塞IO类似。**

&emsp;&emsp;再看前面的一问一答服务器在多路复用模型下的实现图：

![在这里插入图片描述](https://img-blog.csdnimg.cn/20190504003735373.png#pic_center)

&emsp;&emsp;有很多方法的调用，但是如果之前没有对多路复用了解的话，在这里我们只需要了解各个方法大体用途，参数也先放一边，更深层次的建议在结合poll，epoll进行对比来加深理解。

&emsp;&emsp;1）**Select**底层维护一个数组用来存储监听的**fd**，一看到数组就感觉没排面，首先数组的长度受限，其次线性遍历获取活跃fd时间复杂度高。按照标准剧情大佬们会用链表或者树对其进行优化，没错poll的底层是链表，epoll的底层是链表+红黑树；

&emsp;&emsp;2）既然**Select**里有一个数组可以存储进程要处理fd，我们只要将我们感兴趣的事件和fd放入容器(该过程称为注册)，kernel就会在我们注册的感兴趣事件发生时返回给用户进程。

&emsp;&emsp;真好！那我们怎样才能注册呢？

 -  `FD_SET(int fd, fd_set* fds) `//注册到集合，感兴趣事件：可读，可写，异常
 - `FD_CLR(int fd, fd_set* fds) `//从集合删除
 - `FD_ISSET(int fd, fd_set* fds) `//判断是否存在于集合中
 - `int select(int nfds, fd_set *readfds, fd_set *writefds, fd_set *exceptfds`//返回，就绪fd(就绪指发生了感兴趣事件)的数量

&emsp;&emsp;现在在看上面的流程图应该就没啥问题了。这是一个典型的**事件驱动模型**，特点是：一个特定的事件会触发某个特定的响应。

<font color=red>I/O多路复用的缺点：</font>

&emsp;&emsp;当前讨论的I/O多路复用接口的**Select**接口的瓶颈在前面也有说到，主要体现在最大监听句柄数较少，线性遍历时间复杂度高，每一次需要将所有的fd集合从用户态copy到内核态开销大等方面，很多操作系统提供了更为高效的接口，如linux提供了epoll，BSD提供了kqueue，Solaris提供了/dev/poll等等。如果需要实现更高效的服务器程序，类似epoll这样的接口更被推荐。遗憾的是不同的操作系统特供的epoll接口有很大差异，所以使用类似于epoll的接口实现具有较好跨平台能力的服务器会比较困难。

---

### 信号驱动式I/O模型 (signal driven I/O)

&emsp;&emsp;signal driven IO 不太常用就不做细讲,区别于前面的几种模式，它在等待数据到达的时候采用了一种回调的方式，其中回调方法为信号处理函数，如下图：

![在这里插入图片描述](https://img-blog.csdnimg.cn/20190504013526608.png#pic_center)

&emsp;&emsp;首先我们允许Socket进行信号驱动IO,并安装(通过**sigaction函数**)一个信号处理函数(**signal handler**)，用户进程继续运行并不阻塞。当数据准备好时，用户进程会收到一个SIGIO信号，这这时就有两种处理方式：

 - 如果设置了信号处理函数(**signal handler**)，就在signal handler中进行I/O操作；
 - 如果未设置signal handler，就由用户进程(mian loop) 自己去读取处理。
 
&emsp;&emsp;不管用哪种方式处理信号, 我们在等待资料到来的过程中都不会被block. 对main loop来说, 其可以继续执行要做的工作, 并且只需要等待signal handler的通知即可, 不管是数据已经读取好并准备接受处理了或者是数据已经准备好可以被读取了。

---
### 异步I/O模型 (asynchronous I/O)

 &emsp;&emsp;Linux下的asynchronous IO其实用得不多，从内核2.6版本才开始引入。先看一下它的流程图：
 
 ![在这里插入图片描述](https://img-blog.csdnimg.cn/20190504100331994.png#pic_center)

&emsp;&emsp;这里的异步I/O是由POSIX规范定义的，这些函数的工作机制：

&emsp;&emsp;用户进程发起read操作之后，立刻就可以开始去做其它的事。而另一方面，从kernel的角度，当它受到一个asynchronous read之后，首先它会立刻返回，所以不会对用户进程产生任何block。然后，kernel会等待数据准备完成，然后将数据拷贝到用户内存，当这一切都完成之后，kernel会给用户进程发送一个signal，告诉它read操作完成了。

&emsp;&emsp;和上一节的signal driven I/O来比较,主要区别在于：<font color=red>signal driven I/O是由内核通知我们何时可以启动一个I/O操作，而asynchronous I/O是由内核通知我们I/O操作何时完成。即区别在于I/O操作的第二阶段。</font>

#### 再谈异步

&emsp;&emsp;我们接触的异步风格的API或框架有很多，例如Ajax，Netty等，在业务代码层面的表现形式一般为，需要我们设置**feture**(预期返回值)或者**callback**(回调函数)，然后函数立即返回，直到feture或者callback被触发。

&emsp;&emsp;那么这些框架是否是异步I/O框架,很明显是的，因为框架提供给业务代码的接口是异步的，当时这并非代表是满足POSIX规范的异步。因为所处层次不同这里的异步是在业务代码和软件框架之间定义的；

&emsp;&emsp;而POSIX规范定义的异步是整个I/O阶段异步：

`A synchronous I/O operation causes the requesting process to be blocked until that I/O operation completes;`

&emsp;&emsp;定义是在软件框架和kernel之间。那么怎样来避免I/O第二阶段(kernel copy data to appliction)？常见方式：

 - 用户进程在调用asynchronous I/O接口时指定一个缓冲区，然后接口立即返回，在一定时间后通过某种机制(回调，消息，信号等)通知完成，这时候直接去指定缓冲区读数据就行了(通知完成之前缓冲区被系统读写)。
 - 还有一种方式是通过**MMAP**内存映射的方式，让用户进程直接访问设备内存，干脆没了第二步。


![](https://img.shields.io/badge/LWebServer-end-red.svg)
### 总结

&emsp;&emsp;文章总的来说是对I/O模式的概括性学习，其中尤为重要的是I/O多路复用的实现方式，也是当前较多的流行Web服务器在使用的I/O模式，I/O模式是开发中性能提升比较关键的一环。

&emsp;&emsp;文章总结了书籍，博客和自己的理解，总结他人的博客的链接在文章末尾，自己理解的错误点，希望大家及时指出！


>参考：

>[UNIX 网络编程 卷一 第6章 I/O复用](https://library.tebyan.net/en/Viewer/Text/164873/92)
>
>[怎样理解阻塞非阻塞与同步异步](https://www.zhihu.com/question/19732473)
>
>[5种IO模式](https://www.cnblogs.com/findumars/p/6361627.html)
>
>[Linux网络编程--recv函数返回值详解](https://blog.csdn.net/hnlyyk/article/details/51143256)
>
>----
>图片来源：
>
>[特殊API实现异步I/O](https://www.zhihu.com/question/19732473/answer/26091478)
>   
>I/O模式的示意图都来自UNIX Network Programming
