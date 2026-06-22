import React from 'react';
import { Card } from 'reactstrap';
import { LargeLine } from "@/components/partials/charts/campaign/CampaignCharts";

const CampaignPerformance = ({chartData,title}) => {
  return (
    <Card className={`card-full`}>
        <div className="card-inner">
            <div className="card-title-group">
                <div className="card-title">
                    <h6 className="title">{title}</h6>
                </div>
                <div className="card-tools">
                    <ul className="card-tools-nav">
                        <li><a href="#"><span>Week</span></a></li>
                        <li className="active"><a href="#"><span>Month</span></a></li>
                    </ul>
                </div>
            </div>
        </div>
        <div className="card-inner pt-0">
            <ul className="d-flex justify-content-center flex-wrap gx-3 mb-2">
                {chartData.datasets.map((item,index)=> 
                    <li key={index} className="align-center"><span className="dot" style={{background:item.borderColor}}></span><span className="ms-1">{item.label}</span></li>
                )}
            </ul>
            <div className="nk-cmwg2-ck">
                <LargeLine data={chartData} className="campaign-line-chart-s2" />
            </div>
            <div className="chart-label-group ms-5">
                <div className="chart-label">{chartData.labels[0]}</div>
                <div className="chart-label d-none d-sm-block">{chartData.labels[parseInt(chartData.labels.length/4)]}</div>
                <div className="chart-label d-none d-sm-block">{chartData.labels[parseInt(chartData.labels.length/2)]}</div>
                <div className="chart-label d-none d-sm-block">{chartData.labels[parseInt(chartData.labels.length/2 + chartData.labels.length/4)]}</div>
                <div className="chart-label">{chartData.labels[chartData.labels.length - 1]}</div>
            </div>
        </div>
        
    </Card>
  )
}

export default CampaignPerformance