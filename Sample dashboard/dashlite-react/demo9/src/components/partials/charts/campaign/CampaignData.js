export var runningCampaign = {
  labels : ["01 Jan", "02 Jan", "03 Jan", "04 Jan", "05 Jan", "06 Jan", "07 Jan"],
  dataUnit : 'Running Campaign',
  datasets : [{
      label : "People",
      lineTension: .3,
      borderWidth: 1,
      fill:true,
      color: "#fff",
      backgroundColor: "rgba(255,255,255,.15)",
      borderColor: "#fff",
      pointBorderColor: "transparent",
      pointBackgroundColor: "transparent",
      pointHoverBackgroundColor: "#fff",
      pointHoverBorderColor: "#fff",
      pointBorderWidth: 1,
      pointHoverRadius: 4,
      pointHoverBorderWidth: 1,
      pointRadius: 4,
      pointHitRadius: 4,
      data: [85, 125, 105, 115, 130, 106, 141]
  }]
};

export var totalAudience = {
  labels : ["01 Jan", "02 Jan", "03 Jan", "04 Jan", "05 Jan", "06 Jan", "07 Jan"],
  dataUnit : 'Audience',
  datasets : [{
      label : "People",
      lineTension: 0,
      borderWidth: 1,
      fill:true,
      color: "#fff",
      backgroundColor: "rgba(255,255,255,.15)",
      borderColor: "#fff",
      pointBorderColor: "transparent",
      pointBackgroundColor: "transparent",
      pointHoverBackgroundColor: "#fff",
      pointHoverBorderColor: "#fff",
      pointBorderWidth: 1,
      pointHoverRadius: 4,
      pointHoverBorderWidth: 1,
      pointRadius: 4,
      pointHitRadius: 4,
      data: [85, 125, 105, 115, 130, 106, 141]
  }]
};

export var newSubscriber = {
  labels : ["01 Jan", "02 Jan", "03 Jan", "04 Jan", "05 Jan", "06 Jan", "07 Jan"],
  dataUnit : 'Subscriber',
  datasets : [{
      label : "People",
      lineTension: .3,
      borderWidth: 1,
      fill:true,
      color: "#fff",
      backgroundColor: "rgba(255,255,255,.15)",
      borderColor: "#fff",
      pointBorderColor: "transparent",
      pointBackgroundColor: "transparent",
      pointHoverBackgroundColor: "#fff",
      pointHoverBorderColor: "#fff",
      pointBorderWidth: 1,
      pointHoverRadius: 4,
      pointHoverBorderWidth: 1,
      pointRadius: 4,
      pointHitRadius: 4,
      data: [85, 125, 105, 115, 130, 106, 141]
  }]
};

export var avgRating = {
  labels : ["01 Jan", "02 Jan", "03 Jan", "04 Jan", "05 Jan", "06 Jan", "07 Jan", "08 Jan", "09 Jan", "10 Jan", "11 Jan", "12 Jan", "13 Jan", "14 Jan", "15 Jan"],
  datasets : [{
      label : "People",
      borderWidth: 2,
      borderColor: 'transparent',
      hoverBorderColor : 'transparent',
      borderSkipped : 'bottom',
      barPercentage : .8,
      categoryPercentage : .8,
      backgroundColor : ["rgba(255,255,255,.2)","rgba(255,255,255,.2)","rgba(255,255,255,.2)","rgba(255,255,255,.2)","rgba(255,255,255,.2)","rgba(255,255,255,.2)","rgba(255,255,255,.2)","rgba(255,255,255,.2)","rgba(255,255,255,.2)","rgba(255,255,255,.2)","rgba(255,255,255,.2)","rgba(255,255,255,.2)","rgba(255,255,255,.2)","rgba(255,255,255,.2)","rgba(255,255,255,.2)"],
      data: [8200, 7800, 9500, 5500, 9200, 9690, 8200, 7800, 9500, 5500, 9200, 9690, 6032, 9200, 9690, 8200 ]
  }]
};

export var performanceOverview = {
  labels : ["01 Jan", "02 Jan", "03 Jan", "04 Jan", "05 Jan", "06 Jan", "07 Jan", "08 Jan", "09 Jan", "10 Jan", "11 Jan", "12 Jan","13 Jan", "14 Jan", "15 Jan", "16 Jan", "17 Jan", "18 Jan", "19 Jan", "20 Jan", "21 Jan", "22 Jan", "23 Jan", "24 Jan", "25 Jan", "26 Jan", "27 Jan", "28 Jan", "29 Jan", "30 Jan", "31 Jan"],
  dataUnit : 'Leads',
  lineTension : 0,
  datasets : [{
      label : "Social",
      backgroundColor: "transparent",
      borderWidth:2,
      borderColor: "#733AEA",
      pointBorderColor: 'transparent',
      pointBackgroundColor: 'transparent',
      pointHoverBackgroundColor: "#fff",
      pointHoverBorderColor: "#733AEA",
      pointBorderWidth: 2,
      pointHoverRadius: 4,
      pointHoverBorderWidth: 2,
      pointRadius: 4,
      pointHitRadius: 4,
      data: [0, 20, 44, 60, 60, 60, 60, 60, 60, 95, 138, 126, 110, 90, 170, 250, 290, 280, 270, 260, 245, 225, 205, 230,264, 280, 300, 370, 440, 420, 460]
  },{
      label : "Google Ads",
      backgroundColor: "transparent",
      borderWidth:2,
      borderColor: "#FD9722",
      pointBorderColor: 'transparent',
      pointBackgroundColor: 'transparent',
      pointHoverBackgroundColor: "#fff",
      pointHoverBorderColor: "#FD9722",
      pointBorderWidth: 2,
      pointHoverRadius: 4,
      pointHoverBorderWidth: 2,
      pointRadius: 4,
      pointHitRadius: 4,
      data: [100, 85, 80, 65, 75, 90, 115, 130, 150, 170, 185, 195, 240, 280, 320, 325, 330, 340, 350, 335, 325, 315, 305, 295,330, 370, 390, 420, 480, 550, 600]
  },{
      label : "Courses",
      backgroundColor: "transparent",
      borderWidth:2,
      borderColor: "#F2426E",
      pointBorderColor: 'transparent',
      pointBackgroundColor: 'transparent',
      pointHoverBackgroundColor: "#fff",
      pointHoverBorderColor: "#F2426E",
      pointBorderWidth: 2,
      pointHoverRadius: 4,
      pointHoverBorderWidth: 2,
      pointRadius: 4,
      pointHitRadius: 4,
      data: [150, 140, 130, 120, 110, 100, 90, 80, 130, 160, 190, 210, 240, 260, 290, 280, 270, 255, 235, 220, 230, 240, 250, 260, 270, 280, 320, 330, 360, 390, 420]
  },{
      label : "Email",
      backgroundColor: "transparent",
      borderWidth:2,
      borderColor: "#0FCA7A",
      pointBorderColor: 'transparent',
      pointBackgroundColor: 'transparent',
      pointHoverBackgroundColor: "#fff",
      pointHoverBorderColor: "#0FCA7A",
      pointBorderWidth: 2,
      pointHoverRadius: 4,
      pointHoverBorderWidth: 2,
      pointRadius: 4,
      pointHitRadius: 4,
      data: [200, 180, 165, 150, 135, 120, 105, 90, 140, 180, 220, 260, 280, 290, 300, 360, 320, 290, 240, 260, 270, 280, 320, 300, 340, 400, 460, 500, 550, 570, 600]
  }]
};

export var instagramCampaign = {
  labels : ["01 Jan", "02 Jan", "03 Jan", "04 Jan", "05 Jan", "06 Jan", "07 Jan", "08 Jan", "09 Jan", "10 Jan", "11 Jan", "12 Jan","13 Jan", "14 Jan", "15 Jan", "16 Jan", "17 Jan", "18 Jan", "19 Jan", "20 Jan", "21 Jan", "22 Jan", "23 Jan", "24 Jan", "25 Jan", "26 Jan", "27 Jan", "28 Jan", "29 Jan", "30 Jan", "31 Jan"],
  dataUnit : 'Leads',
  step : 1000,
  zero: false,
  datasets : [{
      label : "Social Campaigns",
      backgroundColor : "rgba(115, 58, 234, .5)",  
      fill:true,
      tension: .1,
      borderWidth:2,
      borderColor : "#733AEA",
      pointBorderColor: 'transparent',
      pointBackgroundColor: 'transparent',
      pointHoverBackgroundColor: "#fff",
      pointHoverBorderColor: "#733AEA",   
      pointBorderWidth: 2,
      pointHoverRadius: 4,
      pointHoverBorderWidth: 2,
      pointRadius: 4,
      pointHitRadius: 4,
      data: [2100, 2100, 2100, 2100, 2100, 1800, 1800, 1800, 1800, 1800, 2700, 2700, 2700, 2700, 2400, 2400, 2400, 2400, 3000, 3000, 3000, 3000, 3400, 3400, 3400, 3400, 3400, 3400, 3800, 3800, 3800, 3800]
  }]
};

export var webConvRate = {
  labels : ["01-15 Jan", "16-31 Jan", "01-14 Feb", "15-28 Feb", "01-15 Mar", "16-31 Mar", "01-15 Apr", "16-30 Apr", "01-15 May", "16-30 May", "01-15 Jun", "16-31 Jun",],
  dataUnit : 'Leads',
  step : 10,
  datasets : [{
      backgroundColor : "rgba(242, 66, 110, .5)",
      label : "Conv Rate",
      fill:true,
      tension: .4,
      borderWidth:2,
      borderColor : "#F2426E",
      pointBorderColor: 'transparent',
      pointBackgroundColor: 'transparent',
      pointHoverBackgroundColor: "#fff",
      pointHoverBorderColor: "#F2426E",
      pointBorderWidth: 2,
      pointHoverRadius: 4,
      pointHoverBorderWidth: 2,
      pointRadius: 4,
      pointHitRadius: 4,
      data: [20, 28, 25, 19, 24, 31, 42, 33, 35, 62, 54, 53]
  }]
};