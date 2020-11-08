---
layout: post
title:  "WebServer二三事"
date:   2019-4-11
categories: WebServer二三事
---

![](https://img.shields.io/badge/%E5%85%B3%E4%BA%8E%E4%B8%93%E6%A0%8F-%E5%89%8D%E8%A8%80-red.svg)

&emsp;&emsp;新学期的第一个月在忙碌的工作和学习中结束了，学期课不是很多，但是由于不仅要保证正常的上课，还得兼顾项目的进度和复习，总是感觉时间不太够用，有时觉得假如早半个学期接触编程就好了，也不会像现在一样捉襟见肘。

&emsp;&emsp;想投实习，却发现自己基础比较薄弱，对于原理性的东西理解薄弱，看似什么都会，实则只知其表，不知其里。看着别人各种offer show 自己整个人也变得有点浮躁，博客也搁浅了好长一段时间。所以想通过这个专栏整理一下这个月所学的知识，同时也想以写博客的方式让自己沉静下来进入自己的节奏。

![](https://img.shields.io/badge/%E5%85%B3%E4%BA%8E%E4%B8%93%E6%A0%8F-%E5%86%85%E5%AE%B9-red.svg)

&emsp;&emsp;该专栏的主要内容围绕我实现的一个[简化版的WebServer](https://github.com/defineYIDA/LWebServer) 展开。项目名为：**LWebServer**，意为用来学习服务器原理的项目。主要实现是一个类似于Tomcat的简化版Servlet容器，主要用到下面相关知识：

1）核心的知识为**BIO,NIO,IO multiplexing,AIO**四种IO模式，延伸为:

 - 高性能IO(Select,Poll,Epoll,IOCP)的原理和差异
 - 设计模式(Reactor,Proactor)
 
2）计算机网络相关知识，延伸为：
 - HTTP协议
 - 高性能网络编程，了解各个层次之间的协作
 
3）框架源码
 - Tomcat等一些框架的源码解析，因为项目的实现参照了一些框架源码
 - Spring框架的源码，Servlet，cookie，session，ServletContext等的实现
 
4）源码中的设计模式

5）多线程，并发编程

![](https://img.shields.io/badge/%E5%85%B3%E4%BA%8E%E4%B8%93%E6%A0%8F-%E5%85%B6%E5%AE%83-red.svg)

&emsp;&emsp;可以看出涉及的知识较多，如何总结和归纳将知识连贯起来就变得非常重要，这正是我开启这个专栏的原因之一，还有就是学习是个不断总结书籍和博文的渐进过程，前期的理解可能不到位或者错失关键点，写博客也起到温故知新的效果。

&emsp;&emsp;文章我会尽量把总结过程中参考文章链接给出来；

&emsp;&emsp;希望自己能坚持把这个专栏的内容更新完。

&emsp;&emsp;end

![](https://img.shields.io/badge/%E4%B8%93%E6%A0%8F-Index-red.svg)

 - [WebServer二三事(一)Socket编程说起](https://blog.csdn.net/define_LIN/article/details/89304687)
 - [WebServer二三事(二)五种网络I/O模式](https://blog.csdn.net/define_LIN/article/details/89705770)
 - [同步/异步，阻塞/非阻塞你真的理解了吗？](https://blog.csdn.net/define_LIN/article/details/89724421)

