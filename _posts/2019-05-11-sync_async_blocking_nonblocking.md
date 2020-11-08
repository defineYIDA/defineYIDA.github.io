---
layout: post
title:  "同步/异步，阻塞/非阻塞你真的理解了吗？"
date:   2019-05-11
categories: WebServer二三事
---

###  前言
&emsp;&emsp;对阻塞/非阻塞和同步/异步的概念大家一定不陌生，平常多多少少都会接触，如某个异步的接口调用，一个异步的框架，但是如果真正的让你在面试时定义这个概念，可能就摸不着头脑了。

<font color = "red">常见问题：</font>
 1. 阻塞和非阻塞的区别？
 2. 同步和异步的区别？
 3. 非阻塞和异步一样吗？
 4. 五种I/O模式各自是什么类型？
 5. Java中的NIO/AIO是异步吗？
 6. Epoll是异步吗？
 7. ...

 &emsp;&emsp;对阻塞/非阻塞，同步/异步概念的理解绝非简单的几个买书或者约会的比喻就能解释清楚，这些比喻拿来应付外行还行，如果在面试时说，想想还是蛮尴尬的 (°ー°〃) ，

>**面试官：** 请描述一下异步I/O系统调用。
>
>**我：** 异步指定是我们现在不需要约会，而是在以后某个时间由你来通知我，然后进行约会。
>
>**面试官：**。。。
>
>![在这里插入图片描述](https://img-blog.csdnimg.cn/20190508225503897.png# =99x88)

 &emsp;&emsp;那么应该从什么角度来回答这些问题，才能显得自己是一个聪明能干肯钻研的好后生呢？我得出以下结论：
 - 明定义-----在什么层级上定义的概念
 - 分角度-----从什么角度来比较
 - 会延伸-----将面试往自己期待的方向引导
 
&emsp;&emsp;接下来，看如何理解上面三点！

---
 
### 先修知识
  &emsp;&emsp;阻塞/非阻塞，异步同步的概念涉及的知识比较广，涉及如下几个需要了解的知识：
 
 - <font color="red" >Linux进程</font>
     1）进程切换 
     
     2）进程状态
 - <font color="red" >I/O</font>
     1）缓存I/O
     
     2）网络I/O

>下面只是大致介绍，但是每一点都是十分重要的内容

---
 **进程切换**
 
![在这里插入图片描述](https://img-blog.csdnimg.cn/20190509194823720.png#pic_center)

上图，展示的是由进程P~0~切换到内核，再从内核切换到进程P~1~，最后再切换回来的流程图：

1）中断（interrupt） 或 系统调用（system call） 发生可以使得 CPU 的控制权会从当前进程转移到操作系统内核；

2）操作系统负责保存P~0~在CPU中的上下文(**进程上下文**，所有寄存器中的值，进程的状态，堆栈中的内容)，保存到**PCB~0~(进程控制块)** 中；

3）从PCB~1~中取出进程P~1~的进程上下文，将CPU的控制权转移到进程P~1~，即可以执行P~1~的指令了。

<font color=red>注意： </font>

&emsp;&emsp;我们讨论阻塞/非阻塞，同步/异步一般针对一个特定的系统调用(system call)，例如对硬盘或者网络接口的读写，现在就知道，当我们发起一次`read()`时，我们的进程将被切换到内核态，既然控制权不在调用`read()`的进程了，那势必进程的状态会发生改变。


**进程状态**

![在这里插入图片描述](https://img-blog.csdnimg.cn/20190509194747590.png#pic_center)

上图展示一个进程的不同状态：

>**1）new  进程正在被创建；**
>
>创建状态：进程在创建时需要申请一个空白PCB，向其中填写控制和管理进程的信息，完成资源分配。如果创建工作无法完成，比如资源无法满足,就无法被调度运行，把此时进程所处状态称为创建状态
>
>**2）running 进程的指令正在执行；**
>
>执行状态：进程处于就绪状态被调度后，进程进入执行状态
>
>**3）waiting 进程等待一些事件发生；**
>
>阻塞状态：正在执行的进程由于某些事件（I/O请求，申请缓存区失败）而暂时无法运行，进程受到阻塞。在满足请求时进入就绪状态等待系统调用
>
>**4）ready 进程等待被操作系统调度；**
>
>就绪状态：进程已经准备好，已分配到所需资源，只要分配到CPU就能够立即运行
>
>**5）terminated 进程执行完毕。**
>
>终止状态：进程结束，或出现错误，或被系统终止，进入终止状态。无法再执行

<font color=red>注意： </font>

&emsp;&emsp;到这终于可以总结阻塞I/O的概念了，"阻塞"是指进程发起一个系统调用(System Call)后，由于系统调用的操作不能立即完成(如网络IO中分组未到达)，需要等待一段时间，于是内核将进程挂起为**等待(waiting)** 状态，确保它不会被调度执行，占用CPU资源。

&emsp;&emsp;再回想一下对阻塞/非阻塞的认识，原先最直观的体现为代码会在系统调用时"卡在那一行"，直到调用返回才会执行下一行。经过对进程切换和进程状态的了解，已经知道原因是，系统调用时由于I/O操作不能立即完成，所以进程被切换到了内核，然后调度其他进程，于是该进程状态从**running**--->**waiting**

&emsp;&emsp;进程进入**waiting**状态可能是进程主动调用`wait()`或`sleep()`等挂起进程的函数，还有一种就是前面说的**System Call**

&emsp;&emsp;<font color=red>总的来说，**System Call**造成的阻塞是CPU对资源的合理分配的体现，既然你这个进程需要的资源(指I/O操作对象)还未就绪，那么你就应该让出CPU资源，进入waiting状态，状态内进程不会再被CPU调度，当资源就绪后waiting-->ready，进程就可以再次被分配CPU执行后续指令了。</font>

&emsp;&emsp;到这里暂时只对阻塞从进程状态的角度进行了定义，而系统调用执行I/O操作时，什么原因会导致资源未就绪？非阻塞，异步又是在什么层面的定义？接着往下看。

---
### I/O

&emsp;&emsp;前面讲到I/O操作只是从**调用I/O操作的进程(process)或线程(thread)** 和**内核(kernel)** 两个对象的角度来看，接下引入硬件设备，分析缓存/O和网络I/O里的区别。

&emsp;&emsp;首先先了解

<font color = "red">I/O操作的两个阶段:</font>
 - 等待数据准备 (Waiting for the data to be ready)
 - 将数据从内核拷贝到进程中(Copying the data from the kernel to the process)

<font color = "red">网络I/O操作的两个阶段：</font>
 - 通常需要等待数据从网络中到达,当所有的分组到达被复制到内核中的某个缓冲区(内核态)；
 - 用户进程复制内核缓冲区中的对应数据到进程缓冲区(用户态)；

<font color = "red">POSIX对异步和同步的定义</font>

 - A synchronous I/O operation causes the requesting process to be blocked until that I/O operation completes;

 - An asynchronous I/O operation does not cause the requesting process to be blocked;

&emsp;&emsp;以上概念的定义来自于[UNIX Network Programming, Volume 1 Part 6](http://www.unpbook.com/)

---
**缓存I/O过程**

![在这里插入图片描述](https://img-blog.csdnimg.cn/20190508231900516.png#pic_center =572x348)

①进程向内核发起一个系统调用，

②内核接收到系统调用，知道是对文件的请求，于是告诉磁盘，把文件读取出来

③磁盘接收到来着内核的命令后，把文件载入到内核的内存空间里面(阶段一)

④内核的内存空间接收到数据之后，把数据copy到用户进程的内存空间(阶段二)

⑤进程内存空间得到数据后，给内核发送通知

⑥内核把接收到的通知回复给进程，此过程为唤醒进程，然后进程得到数据，进行下一步操作

![在这里插入图片描述](https://img-blog.csdnimg.cn/20190510171812969.png#pic_center =572x348)

&emsp;&emsp;可见阻塞I/O导致阶段一，阶段二期间进程都处于waiting状态，再来看看非阻塞的示意图：

![在这里插入图片描述](https://img-blog.csdnimg.cn/20190510173127312.png#pic_center =572x348)

&emsp;&emsp;**非阻塞I/O在第一阶段会以轮询的方式进行系统调用，即第一阶段并没有阻塞，但是在I/O的第二阶段还是发生了阻塞。**

<font color=red>注意： </font>

&emsp;&emsp;如果从操作系统提供的系统调用接口来来理解，操作系统可以提供多种风格的接口，**阻塞式I/O系统调用(blocking I/O system call)** 会使进程阻塞的等待结果返回，**非阻塞式系统调用(Nonblocking I/O system call)** 立即返回一个值。

&emsp;&emsp;再往深看，从上两幅图可以看出，进程发起System call 内核需要与I/O设备(磁盘，网卡等)完成交互，内核向I/O设备发起一个请求(步骤②)，也可以阻塞地等待IO设备返回结果，或者非阻塞的继续进行其他操作，

&emsp;&emsp;在现代计算机中，一般使用**DMA(Direct Memory Access)** 来进行数据传输，CPU只需要向DMA控制器下达指令，让DMA控制器来处理数据的传送即可，DMA控制器通过系统总线来传输数据，传送完毕再通知CPU，是**异步过程**。

&emsp;&emsp;而**异步系统调用（asychronous system call）**，更像是**非阻塞式系统调用(Nonblocking I/O system call)** 的"升级版"，对于Socket来说内核对阻塞和非阻塞系统调用的区别，来源于我们将Socket设置为阻塞还是非阻塞，而异步就必须依赖于特殊的API，比如Linux的AIO，Windows的IOCP等。


**异步**

![在这里插入图片描述](https://img-blog.csdnimg.cn/20190510224340932.png#pic_center =572x348)

<font color=red>注意： </font>

&emsp;&emsp;明显**异步在I/O的第一阶段和第二阶段都未阻塞**，异步机制里我们发起系统调用后立即返回，当I/O操作完成(数据已经到了进程缓冲区)，设置一个用户空间特殊的变量值 或者 触发一个 signal 或者 产生一个软中断 或者 调用应用程序的回调函数，所以从业务代码层面的表现形式一般为，需要我们设置**feture(预期返回值)** 或者**callback(回调函数)**，然后函数立即返回，直到feture或者callback被触发。

---
### 从输入操作的返回值的角度来对比非阻塞和异步

&emsp;&emsp;在网络I/O中对于一个输入操作，包括`read`,`readv`,`recv`,`recvform`,`recvmsg`共五个函数。

&emsp;&emsp;对于一个阻塞Socket，调用当该Socket的接收缓冲区中没有数据到达时，前面也说到过进程将进入睡眠(waiting)，<font color=red>直到一些数据到达</font>，我将前面一句话标红，是将"一些数据到达"作为一个标志。

&emsp;&emsp;**一些数据到达**：

 - 对于TCP协议来说，既然是字节流协议这些数据即可能是单个字节，也可以是完整的TCP分节中的数据。如果想等到某个固定数目的数据可读为止，那么可以在调用`readn`函数，或者在调用设置`flags`参数为`MSG_WAITALL`。
 - 对于UDP数据报协议，一个阻塞的UDP Socket的接收缓冲区为空，进程进入睡眠，直到一个完整的数据报到达。
 
&emsp;&emsp;对于非阻塞套接字，如果输入操作不能满足(TCP即至少一个字节的数据可读；UDP 即有一个完整数据报可读)，那么相应的调用返回一个`EWOULDBLOCK`错误。[recv函数的返回值](https://blog.csdn.net/define_LIN/article/details/89705770#recv_96)

<font color=red>结果： </font>
 - 非阻塞I/O 系统调用输入操作立即返回的是任何可以立即拿到的数据， 可以是完整的结果， 也可以是不完整的结果，还可以是一个空值。
 - 而异步I/O系统调用的结果必须是完整的， 但是这个操作完成是通过回调或者signal 等机制，在某个时间点由内核发起。
 
>&emsp;&emsp;此节知识参考《UNIX Network Programming, Volume 1 第16章 非阻塞I/O》。

---
### 关于常见的异步框架
&emsp;&emsp;到这里基本对同步/异步，阻塞/非阻塞的概念从多各角度进行了理解，但是可能会发现好像我们之前接触的一些冠以异步的框架或者函数包，好像不太符合我们这里定义的异步啊。

&emsp;&emsp;没错符合POSIX定义的异步的I/O的操作系统还是较少的(这是UNIX Network Programming里说的)，不同的操作系统下有不同的实现。真正的异步，一定是指定在某个操作系统下实现的,如下我截取了几个符合POSIX异步的官网描述：

[Linux libaio](https://pagure.io/libaio)
>The Linux-native asynchronous I/O facility ("async I/O", or "aio") has a richer API and capability set than the simple POSIX async I/O facility. 

[Windows IOCP](https://docs.microsoft.com/en-us/windows/desktop/fileio/i-o-completion-ports)
>I/O completion ports provide an efficient threading model for processing multiple asynchronous I/O requests on a multiprocessor system.

&emsp;&emsp;再来看看几个"冒牌"异步(不符合POSIX定义)

[Netty](https://netty.io/wiki/user-guide-for-4.x.html)
>The Netty project is an effort to provide an asynchronous event-driven network application framework and tooling for the rapid development of maintainable high-performance · high-scalability protocol servers and clients.

[Ajax](https://www.adaptivepath.com/ideas/ajax-new-approach-web-applications/)
>asynchronous data retrieval using XMLHttpRequest;

&emsp;&emsp;其实"冒牌"异步也是异步，异步的定义是基于具体层级的，POSIX的定义基于**应用层(操作系统提供异步接口)**，**内核(与IO设备交互)**，而Netty，Ajax的异步更多是指框架提供的接口风格(还是在应用层)。

---
### 最后
&emsp;&emsp;回到开始的面试话题：
 - 明定义，问是不是POSIX定义的异步
 - 分角度，从整个I/O过程(阶段)的角度，从返回值的角度
 - 会延伸，这个就看自己熟悉那个方向，Socket编程？操作系统内核？框架？
 
&emsp;&emsp;文章只是基于我当前认知的总结，如果有误欢迎大家评论指出！

>话说我自己都没面过试，怎么还传授起经验来了？奇了怪。。。

>参考文章:
>
>[UNIX Network Programming, Volume 1 Part 6](http://www.unpbook.com/)
>
>[怎样理解阻塞非阻塞与同步异步的区别？-萧萧的回答](https://www.zhihu.com/question/19732473/answer/241673170)
>
>[怎样理解阻塞非阻塞与同步异步的区别？-灵剑的回答](https://www.zhihu.com/question/19732473/answer/117012135)
>
>---
>图片来源(侵删)：
>
>[asynchronous read and synchronous read](https://www.uio.no/studier/emner/matnat/ifi/INF3151/v16/timeplan/io.pdf)
>
>[I/O过程图](https://www.cnblogs.com/budongshu/p/5117584.html)
>
>[进程切换和进程状态](https://www.cs.odu.edu/~cs471w/spring11/lectures/Processes.htm)
>
>[网络I/O接收报文流程图](http://www.taohui.pub/2016/01/26/%E9%AB%98%E6%80%A7%E8%83%BD%E7%BD%91%E7%BB%9C%E7%BC%96%E7%A8%8B3-tcp%E6%B6%88%E6%81%AF%E7%9A%84%E6%8E%A5%E6%94%B6/)
