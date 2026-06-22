import React, { useState } from "react";
import { PreviewAltCard } from "@/components/Component";
import { BalanceFlowChart } from "@/components/partials/charts/panel/PanelCharts";

const BalanceFlow = () => {
  const [tab, setTab] = useState("year");

  return (
    <React.Fragment>
      <div className="card-head">
        <div className="card-title mb-0">
          <h5 className="title">Balance Flow</h5>
        </div>
        <div className="card-tools">
          <ul className="card-tools-nav">
            <li onClick={() => setTab("month")} className={tab === "month" ? "active" : ""}>
              <a href="#tabs" onClick={(ev) => ev.preventDefault()}>
                This Month
              </a>
            </li>
            <li onClick={() => setTab("year")} className={tab === "year" ? "active" : ""}>
              <a href="#tabs" onClick={(ev) => ev.preventDefault()}>
                This Year
              </a>
            </li>
          </ul>
        </div>
      </div>
      <PreviewAltCard className="">
        <div className="nk-wg4">
          <div className="nk-wg4-group justify-center gy-3 gx-4">
            <div className="nk-wg4-item">
              <div className="sub-text">
                <div className="dot dot-lg sq" style={{ background: "rgb(92, 224, 170)" }}></div> <span>Received</span>
              </div>
            </div>
            <div className="nk-wg4-item">
              <div className="sub-text">
                <div className="dot dot-lg sq" style={{ background: "rgb(121, 139, 255)" }}></div> <span>Send</span>
              </div>
            </div>
            <div className="nk-wg4-item">
              <div className="sub-text">
                <div className="dot dot-lg sq" style={{ background: "rgb(246, 202, 62)" }}></div>
                <span>Withdraw</span>
              </div>
            </div>
          </div>
        </div>
        <div className="nk-ck3">
          <div className="chartjs-size-monitor">
            <div className="chartjs-size-monitor-expand">
              <div className=""></div>
            </div>
            <div className="chartjs-size-monitor-shrink">
              <div className=""></div>
            </div>
          </div>
          <BalanceFlowChart state={tab} />
        </div>
      </PreviewAltCard>
    </React.Fragment>
  );
};

export default BalanceFlow;
