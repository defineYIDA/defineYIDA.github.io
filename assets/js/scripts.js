// A $( document ).ready() block.
$( document ).ready(function() {

	// DropCap.js
	var dropcaps = document.querySelectorAll(".dropcap");
	window.Dropcap.layout(dropcaps, 2);

	// Responsive-Nav
	var nav = responsiveNav(".nav-collapse");

	// Round Reading Time
    $(".time").text(function (index, value) {
      return Math.round(parseFloat(value));
    });
    //按照时间设置首页图片
    var myDate = new Date();
    hour= myDate.getHours(); //0-23
    var header = document.getElementById('header');
    var temp = hour % 5
    if (temp != 0) {
      header.style.backgroundImage = "url(\"assets/img/touring" +temp.toString() +".jpg\")"
    }
});


