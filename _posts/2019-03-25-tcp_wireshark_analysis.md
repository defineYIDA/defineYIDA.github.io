---
layout: post
title:  "WireShark分析TCP握手挥手过程"
date:   2019-3-25
categories: Network
---

### 三次握手
![图片来源看水印](https://img-blog.csdnimg.cn/20190323110738436.png)

### 四次挥手
![在这里插入图片描述](https://img-blog.csdnimg.cn/20190323110800745.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2RlZmluZV9MSU4=,size_16,color_FFFFFF,t_70)
### TCP报文段结构
![在这里插入图片描述](https://img-blog.csdnimg.cn/20190323111713173.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2RlZmluZV9MSU4=,size_16,color_FFFFFF,t_70)

----------
**看到这三张图你可能会说，教练我又被你的车牌骗上车咯，上个教练也是这样教的，各种标志位，序号(seq)，确定号(Ack)的转换把我脑壳都搞晕了，你连图片都不换，也太敷衍了吧！**

**先别下车，不要把我和外面那些复制粘贴怪混为一谈，上面的三张只是作为对TCP连接建立和拆除的流程和报文结构大致了解，其他的具体内容我和你细细道来。**

### 抓包获取到一个完整过程(三次握手+数据传输+四次挥手)的报文
>ps:这里你可以尝试进行抓包，也可以直接参考我的抓包结果。具体抓包过程就不细致说了，大家可以查一下教程

我这里采用的抓包工具是**WireShark**，抓取TCP报文比较简单。

但想抓取到一个完整的过程的还是比较讲究的,原因在于现在大部分的服务器对于客户机的Socket都采用了各种各种各样的保活机制实现长连接，导致四次挥手的时机不太好把握，使用WireShark可以通过端口筛选一段时间内的所有包得到完整的报文。

我这里监控的是连接到我本地的服务端口8080的TCP连接，**得到的结果如下：**
![在这里插入图片描述](https://img-blog.csdnimg.cn/20190323151443487.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2RlZmluZV9MSU4=,size_16,color_FFFFFF,t_70)

到这里我们就得到了一个完整请求的TCP报文段，观察上图可以清楚的看出整体流程，

**客户机的端口号为：32624**

**服务端的端口为：8080**

具体过程中各种参数，我们先不细究
将注意转移到上图的**Info**字段，Info字段的字段既然软件优先显示，
即代表这些参数是协议中最重要的也是我们重点需要关注的。

---
### 重点了解的报文段结构
结合图三，重点关注TCP报文段的以下属性：

**六个标志位(flag field,6 bit)**

| flag | 含义  |
|-- |--|
| **确认ACK** |用于指定确认字段中的值有效，即**该报文段包括一个对已被成功接收的报文段的确认**，TCP 规定，在连接建立后所有传达的报文段都必须把 ACK 置 1 |
| **同步SYN**[1] | 仅在三次握手建立 TCP 连接时有效。当 SYN = 1 而 ACK = 0 时，表明这是一个连接请求报文段，对方若同意建立连接，则应在相应的报文段中使用 SYN = 1 和 ACK = 1。因此，SYN 置 1 就表示这是一个连接请求或连接接受报文 |
| **终止FIN**[2]|用来释放一个连接。当 FIN = 1 时，表明此报文段的发送方的数据已经发送完毕，并要求释放运输连接  |
| 复位RST[3]|用于复位相应的 TCP 连接  |
| 推送PSH|  指示接收方应立即将数据交给上层|
| 紧急URG| 指示报文段中存在被发送方上层实体设置为“紧急”的数据 |

> PSH和URG和紧急数据指针都并没有使用，可能是为了扩展需要的保留位。

> 1 2 3标号的用于连接的建立与拆除。

**序号(Seguence number,Seg,32 bit)**

* 该报文段的数据字段首字节的序号 

**确定号(Acknowledgment number,Ack,32 bit)**
* 主机期待的数据的下一个字节序号

**数据长度(TCP Segment Len,Len)**
* TCP 首部结束之后的部分(报文总长度减去首部长度，其中首部长度也叫**数据偏移**)
---
### 数据传输过程
**一般我们学习的过程都是从握手开始然后挥手，最后再看数据传输过程，但是我认为这样不太合理，我们应该先看数据传输过程，然后把握手和挥手当作服务器和客户机之间特殊的数据传输过程！这样就更方便我们的理解。**

下面是一个基于TCP的简单Telent应用的确认号和序列号：

**过程为** 主机A向主机B发送一个"C",然后主机B返回"C"给主机A

![在这里插入图片描述](https://img-blog.csdnimg.cn/20190325113638286.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2RlZmluZV9MSU4=,size_16,color_FFFFFF,t_70)
>图片来自 《计算机网络-自顶向下方法》p159

观察上面的过程结合我的备注，值得特别注意的点有：
* 首先上图是连接已经建立且不发生数据丢失的情况下发生的数据传输过程；
* 第二个报文段由服务端发往客户机，目的有两个：

   1)为接收到的数据提供确认(Ack=43);

   2)回传数据;

   此时这种将对数据的确认被装载在一个承载服务器到客户机的数据的报文段中，这种确认被称为**捎带**在服务器到客户机的数据报文段中。

* 第三个报文段的唯一目的是确认已从服务器收到数据。
* 在当前的Telnet应用中需要TCP传输的数据的大小为一个字节，并且整个过程中存在我们上一点说的**捎带**的情况，当我们将需要传输的数据的大小和初始确认的报文段进行扩展：

![在这里插入图片描述](https://img-blog.csdnimg.cn/2019032520522980.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2RlZmluZV9MSU4=,size_16,color_FFFFFF,t_70)

----
### 解析报文
经过上节的对数据传输过程的理解，相信对序号和确认号的转换已经有了准确的理解，然后再来逐条分析上面我们抓取到的报文段！
![在这里插入图片描述](https://img-blog.csdnimg.cn/20190325205927940.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2RlZmluZV9MSU4=,size_16,color_FFFFFF,t_70)
再贴一下我抓取到的数据，观察字段名，值得注意以下几点：
* No. 不是前面说的数据序号(它是软件对抓取数据的编号，无实际含义)，Seg才是序号；
* TCP连接建立在主机的8080和32624端口之间；
* 注意协议的转换，HTTP是应用层协议建立传输层协议TCP上。
#### 三次握手
![在这里插入图片描述](https://img-blog.csdnimg.cn/20190325212757738.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2RlZmluZV9MSU4=,size_16,color_FFFFFF,t_70)
![在这里插入图片描述](https://img-blog.csdnimg.cn/20190325212603596.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2RlZmluZV9MSU4=,size_16,color_FFFFFF,t_70)

**重要的连接的状态的转换：**

起初A和B都处于**CLOSED**状态

——>

**1)** B创建TCB，处于**LISTEN**状态(监听)，等待A请求

——>

**2)** A创建TCB，发送连接请求（SYN=1，seq=x），进入**SYN-SENT**状态(同步已发送)

<font color='red'>TCP规定，SYN报文段（SYN=1的报文段）不能携带数据，但需要消耗掉一个序号</font>

——>

**3)** B收到连接请求，向A发送确认（SYN=ACK=1，确认号Ack=x+1，初始序号seq=y），进入**SYN-RCVD**状态

<font color='red'>这个也为SYN报文段（SYN=1的报文段）不能携带数据，但需要消耗掉一个序号</font>

——>

**4)** A收到B的确认后，给B发出确认（ACK=1，ack=y+1，seq=x+1），A进入**ESTABLISHED**状态

<font color='red'>TCP规定，ACK报文段可以携带数据，如果不携带则不消耗序号</font>

——>

**5)** B收到A的确认后，进入**ESTABLISHED**状态。

---
**ISN**
三次握手的一个重要功能是客户端和服务端交换ISN(Initial Sequence Number), 以便让对方知道接下来接收数据的时候如何按序列号组装数据。

如果ISN是固定的，攻击者很容易猜出后续的确认号。

    ISN = M + F(localhost, localport, remotehost, remoteport)

M是一个计时器，每隔4毫秒加1。 F是一个Hash算法，根据源IP、目的IP、源端口、目的端口生成一个随机数值。要保证hash算法不能被外部轻易推算得出。

**为什么A还要发送一次确认呢？可以二次握手吗？**

答：

主要为了防止已失效的连接请求报文段突然又传送到了B，因而产生错误。如A发出连接请求，但因连接请求报文丢失而未收到确认，于是A再重传一次连接请求。后来收到了确认，建立了连接。数据传输完毕后，就释放了连接，A工发出了两个连接请求报文段，其中第一个丢失，第二个到达了B，但是第一个丢失的报文段只是在某些网络结点长时间滞留了，延误到连接释放以后的某个时间才到达B，此时B误认为A又发出一次新的连接请求，于是就向A发出确认报文段，同意建立连接，不采用三次握手，只要B发出确认，就建立新的连接了，此时A不理睬B的确认且不发送数据，则B一致等待A发送数据，浪费资源。

**什么是SYN攻击？**

答：

服务器端的资源分配是在二次握手时分配的，而客户端的资源是在完成三次握手时分配的，所以服务器容易受到SYN洪泛攻击，SYN攻击就是Client在短时间内伪造大量不存在的IP地址，并向Server不断地发送SYN包，Server则回复确认包，并等待Client确认，由于源地址不存在，因此Server需要不断重发直至超时，这些伪造的SYN包将长时间占用未连接队列，导致正常的SYN请求因为队列满而被丢弃，从而引起网络拥塞甚至系统瘫痪。

防范SYN攻击措施：降低主机的等待时间使主机尽快的释放半连接的占用，短时间受到某IP的重复SYN则丢弃后续请求。

---
#### 数据传输

![在这里插入图片描述](https://img-blog.csdnimg.cn/20190325221459864.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2RlZmluZV9MSU4=,size_16,color_FFFFFF,t_70)

**过程：**

首先由客户机发起一个GET请求，HTTP协议的请求报文以ASCII码传输，由图可知报文段总长度为682，数据长度为279，数据的首字节序号为1。结合三次握手结束时的状态，Ack=1；

——>

**1)** 服务器完整接收数据，则服务器答复ACK，且Ack=280为当前服务器的期待序号；

——>

**2)** 服务器处理HTTP请求的报文，得出响应结果为一个html文件，大小为525；

<font color='red'>并没有采用前面提到的**稍带**的方式，答复后再传输数据</font>

——>

**3)** 客户机接收到html，立即答复服务器，表示当前期待为526序号的数据，前525已经接收到了。


#### 四次挥手
![在这里插入图片描述](https://img-blog.csdnimg.cn/20190325223601920.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2RlZmluZV9MSU4=,size_16,color_FFFFFF,t_70)
![在这里插入图片描述](https://img-blog.csdnimg.cn/20190325223531356.png)
<font color='red'>注意上图我的关闭请求是由服务器发起的，因为我在发送了文件后对Socket进行了close，为HTTP短连接，其实过程和客户机发起的区别不大</font>
**过程详述：**

假设Client端发起中断连接请求，也就是发送FIN报文。Server端接到FIN报文后，意思是说"我Client端没有数据要发给你了"，但是如果你还有数据没有发送完成，则不必急着关闭Socket，可以继续发送数据。所以你先发送ACK，"告诉Client端，你的请求我收到了，但是我还没准备好，请继续你等我的消息"。

这个时候Client端就进入FIN_WAIT状态，继续等待Server端的FIN报文。当Server端确定数据已发送完成，则向Client端发送FIN报文，"告诉Client端，好了，我这边数据发完了，准备好关闭连接了"。
Client端收到FIN报文后，"就知道可以关闭连接了，但是他还是不相信网络，怕Server端不知道要关闭，所以发送ACK后进入TIME_WAIT状态，如果Server端没有收到ACK则可以重传。“，Server端收到ACK后，"就知道可以断开连接了"。Client端等待了**2MSL(最大报文段生存时间)** 后依然没有收到回复，则证明Server端已正常关闭，那好，我Client端也可以关闭连接了。

<font color='red'>注意是主动关闭方等待2MSL，即服务器发起则服务器等待进入TIME_WAIT状态，可以结合抓包理解服务器主动关闭的状态变化</font>

---

**状态的转换：**

服务器和客户机的起始状态都是**ESTABLISHED**

**1）** A的应用进程先向其TCP发出连接释放报文段（FIN=1，序号seq=u=），并停止再发送数据，主动关闭TCP连接，进入**FIN-WAIT-1**（终止等待1）状态，等待B的确认。

<font color='red'>TCP规定，FIN报文段（FIN=1的报文段）不能携带数据，但需要消耗掉一个序号</font>

——>

**2）** B收到连接释放报文段后即发出确认报文段，（ACK=1，确认号ack=u+1，序号seq=v），B进入**CLOSE-WAIT**（关闭等待）状态，此时的TCP处于**半关闭状态**，A到B的连接释放。

——>

**3）** A收到B的确认后，进入**FIN-WAIT-2**（终止等待2）状态，等待B发出的连接释放报文段。

——>

**4）** B没有要向A发出的数据，B发出连接释放报文段（FIN=1，ACK=1，序号seq=w，确认号ack=u+1），B进入**LAST-ACK**（最后确认）状态，等待A的确认。

——>

**5）** A收到B的连接释放报文段后，对此发出确认报文段（ACK=1，seq=u+1，ack=w+1），A进入**TIME-WAIT**（时间等待）状态。此时TCP未释放掉，需要经过时间等待计时器设置的时间2MSL后，A才进入**CLOSED**状态。

<font color='red'>结合过程可以看出，主动关闭方，会接收TCP连接晚，需要在2MSL内确定对方完全真实的关闭了才进入**CLOSED**状态</font>

---

**为什么A在TIME-WAIT状态必须等待2MSL的时间？**

MSL最长报文段寿命Maximum Segment Lifetime，MSL=2

答：

假象网络不可靠。

两个理由：

（1）保证A发送的最后一个ACK报文段能够到达B。

（2）防止“已失效的连接请求报文段”出现在本连接中。

1）这个ACK报文段有可能丢失，使得处于LAST-ACK状态的B收不到对已发送的FIN+ACK报文段的确认，B超时重传FIN+ACK报文段，而A能在2MSL时间内收到这个重传的FIN+ACK报文段，接着A重传一次确认，重新启动2MSL计时器，最后A和B都进入到CLOSED状态，若A在TIME-WAIT状态不等待一段时间，而是发送完ACK报文段后立即释放连接，则无法收到B重传的FIN+ACK报文段，所以不会再发送一次确认报文段，则B无法正常进入到CLOSED状态。

2）如果Client直接CLOSED，然后又再向Server发起一个新连接，我们不能保证这个新连接与刚关闭的连接的端口号是不同的。也就是说有可能新连接和老连接的端口号是相同的。一般来说不会发生什么问题，但是还是有特殊情况出现：假设新连接和已经关闭的老连接端口号是一样的，如果前一次连接的某些数据仍然滞留在网络中，这些延迟数据在建立新连接之后才到达Server，由于新连接和老连接的端口号是一样的，又因为TCP协议判断不同连接的依据是socket pair，于是，TCP协议就认为那个延迟的数据是属于新连接的，这样就和真正的新连接的数据包发生混淆了。

**为什么连接的时候是三次握手，关闭的时候却是四次握手？**

答：

因为当Server端收到Client端的SYN连接请求报文后，可以直接发送SYN+ACK报文。其中ACK报文是用来应答的，SYN报文是用来同步的。但是关闭连接时，当Server端收到FIN报文时，很可能并不会立即关闭SOCKET，所以只能先回复一个ACK报文，告诉Client端，"你发的FIN报文我收到了"。只有等到我Server端所有的报文都发送完了，我才能发送FIN报文，因此不能一起发送。故需要四步握手。


