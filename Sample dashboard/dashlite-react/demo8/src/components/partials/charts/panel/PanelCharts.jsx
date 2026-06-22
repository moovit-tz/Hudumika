import { useEffect, useState } from "react";
import { Bar, Line } from "react-chartjs-2";

import { Chart, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler, Legend, } from "chart.js";
Chart.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler, Legend,);

import { profitCM, refBarChart, refBarChart4, refBarChartSet2, refBarChartSet3 } from "./PanelChartData";

export const ReferralCharts = ({ state }) => {
  const [data, setData] = useState(refBarChart);
  useEffect(() => {
    let object;
    if (state === "7") {
      object = refBarChartSet2;
    } else if (state === "15") {
      object = refBarChartSet3;
    } else {
      object = refBarChart4;
    }
    setData(object);
  }, [state]);
  return (
    <Bar
      data={data}
      className="chart-refer-stats chartjs-render-monitor"
      options={{
        plugins: {
          legend: {
              display: false,
          },
          tooltip: {
              enabled: true,
              displayColors: false,
              backgroundColor: "#fff",
              titleFont: {
                size: '11px',
              },
              titleColor: "#6783b8",
              titleMarginBottom: 4,
              bodyColor: "#9eaecf",
              bodyFont: {
                size: '10px',
              },
              bodySpacing: 3,
              padding: 8,
              footerMarginTop: 0,
              callbacks: {
                title: function () {
                  return false; 
                },
                label: function (context) {
                    return `${context.parsed.y} people`;
                },
              },
          },
        },
        maintainAspectRatio: false,
        scales: {
          y:{
              display: false,
              ticks: {
                beginAtZero: true,
              },
            },
          x: {
              display: false,
            },
        },
      }}
    />
  );
};

export const ProfitCharts = () => (
  <Line
    data={profitCM}
    options={{
      plugins: {
        legend: {
            display: false,
        },
        tooltip: {
            enabled: true,
            displayColors: false,
            backgroundColor: "#eff6ff",
            titleFont: {
              size: '11px',
            },
            titleColor: "#6783b8",
            titleMarginBottom: 4,
            bodyColor: "#9eaecf",
            bodyFont: {
              size: '10px',
            },
            bodySpacing: 3,
            padding: 8,
            footerMarginTop: 0,
            callbacks: {
              title: function () {
                return false; 
              },
              label: function (context) {
                  return `${context.parsed.y} USD`;
              },
            },
        },
      },
      maintainAspectRatio: false,
      scales: {
        y:{
            display: false,
            ticks: {
              beginAtZero: true,
            },
          },
        x: {
            display: false,
          },
      },
    }}
  />
);
