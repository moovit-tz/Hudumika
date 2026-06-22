import React, { useEffect, useState } from "react";
import { Line, Bar, Doughnut } from "react-chartjs-2";

import { Chart, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Filler, Legend, } from "chart.js";
Chart.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Filler, Legend, );

export const CleanLine = ({ data, className }) => {
  return (
    <Line
      className={className}
      data={data}
      options={{
        plugins: {
          legend: {
              display: false,
          },
          tooltip: {
              enabled: true,
              displayColors: false,
              backgroundColor: "#1c2b46",
              titleFont: {
                size: '10px',
              },
              titleColor: "#fff",
              titleMarginBottom: 4,
              bodyColor: "#fff",
              bodyFont: {
                size: '10px',
              },
              bodySpacing: 4,
              padding: 6,
              footerMarginTop: 0,
              callbacks: {
                label: function (context) {
                    return `${context.parsed.y} ${data.dataUnit}`;
                },
              },
          },
        },
        maintainAspectRatio: false,
        scales: {
          y: {
              display: false,
              ticks: {
                beginAtZero: false,
                color:"#9eaecf", 
                font: {
                  size: '12px',
                },
                padding: 0,
                stepSize: 300,
              },
              grid: {
                color: "rgba(82, 100, 132, 0.2)",
                tickMarkLength: 0,
                zeroLineColor: "rgba(82, 100, 132, 0.2)",
              },
            },
          x: {
              display: false,
              ticks: {
                color:"#9eaecf", 
                font: {
                  size: '12px',
                },
                source: "auto",
                padding: 0,
              },
              grid: {
                color: "transparent",
                tickMarkLength: 0,
                zeroLineColor: "rgba(82, 100, 132,0.2)",
                offsetGridLines: true,
              },
            },
        },
      }}
    ></Line>
  );
};

export const LargeLine = ({ data, className }) => {
  return (
    <Line
      className={className}
      data={data}
      options={{
        plugins: {
          legend: {
              display: false,
          },
          tooltip: {
              enabled: true,
              displayColors: false,
              backgroundColor: "#fff",
              borderColor:'#eff6ff',
              borderWidth:2,
              titleFont: {
                size: '13px',
              },
              titleColor: "#6783b8",
              titleMarginBottom: 6,
              bodyColor: "#9eaecf",
              bodyFont: {
                size: '12px',
              },
              bodySpacing: 4,
              padding: 10,
              footerMarginTop: 0,
              callbacks: {
                label: function (context) {
                    return `${context.parsed.y} ${data.dataUnit}`;
                },
              },
          },
        },
        maintainAspectRatio: false,
        scales: {
          y: {
              display: true,
              border:{dash: [5, 5]},
              ticks: {
                beginAtZero: false,
                color:"#9eaecf", 
                font: {
                  size: '12px',
                },
                padding: 8,
                stepSize: 100,
              },
              grid: {
                color: "rgba(82, 100, 132, 0.1)",
                tickMarkLength: 0,
                zeroLineColor: "rgba(82, 100, 132, 0.1)",
              },
            },
          x: {
              display: false,
              border:{dash: [5, 5]},
              ticks: {
                color:"#9eaecf", 
                font: {
                  size: '12px',
                },
                source: "auto",
                padding: 0,
              },
              grid: {
                color: "transparent",
                tickMarkLength: 0,
                zeroLineColor: "transparent",
                offsetGridLines: true,
              },
            },
        },
      }}
    ></Line>
  );
};

export const MediumLine = ({ data, className }) => {
  return (
    <Line
      className={className}
      data={data}
      options={{
        plugins: {
          legend: {
              display: false,
          },
          tooltip: {
              enabled: true,
              displayColors: false,
              backgroundColor: "#fff",
              borderColor:'#eff6ff',
              borderWidth:2,
              titleFont: {
                size: '13px',
              },
              titleColor: "#6783b8",
              titleMarginBottom: 6,
              bodyColor: "#9eaecf",
              bodyFont: {
                size: '12px',
              },
              bodySpacing: 4,
              padding: 10,
              footerMarginTop: 0,
              callbacks: {
                label: function (context) {
                    return `${context.parsed.y} ${data.dataUnit}`;
                },
              },
          },
        },
        maintainAspectRatio: false,
        scales: {
          y: {
              display: true,
              border:{dash: [5, 5]},
              ticks: {
                beginAtZero: (data.zero) ? data.zero : true,
                color:"#9eaecf", 
                font: {
                  size: '12px',
                },
                padding: 8,
                stepSize: (data.step) ? data.step : 100,
              },
              grid: {
                color: "rgba(82, 100, 132, 0.1)",
                tickMarkLength: 0,
                zeroLineColor: "rgba(82, 100, 132, 0.1)",
              },
            },
          x: {
              display: false,
              border:{dash: [5, 5]},
              ticks: {
                color:"#9eaecf", 
                font: {
                  size: '12px',
                },
                source: "auto",
                padding: 0,
              },
              grid: {
                color: "transparent",
                tickMarkLength: 0,
                zeroLineColor: "transparent",
                offsetGridLines: true,
              },
            },
        },
      }}
    ></Line>
  );
};

export const CleanBar = ({ data, className }) => {
  return (
    <Bar
      className={className}
      data={data}
      options={{
        plugins: {
          legend: {
              display: false,
          },
          tooltip: {
              enabled: true,
              displayColors: false,
              backgroundColor: "#1c2b46",
              titleFont: {
                size: '10px',
              },
              titleColor: "#fff",
              titleMarginBottom: 4,
              bodyColor: "#fff",
              bodyFont: {
                size: '10px',
              },
              bodySpacing: 4,
              padding: 6,
              footerMarginTop: 0,
          },
        },
        maintainAspectRatio: false,
        scales: {
          y:{
              display: false,
              stacked: true,
              ticks: {
                beginAtZero: true,
              },
            },
          x: {
              display: false,
              stacked: true,
            },
        },
      }}
    ></Bar>
  );
};