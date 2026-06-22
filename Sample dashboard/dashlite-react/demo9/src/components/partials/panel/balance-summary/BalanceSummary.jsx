import React, { useState } from "react";
import { PreviewAltCard } from "@/components/Component";
import { BalanceSummaryChart } from "@/components/partials/charts/panel/PanelCharts";

const BalanceSummary = () => {
  const [tab, setTab] = useState("year");

  return (
    <PreviewAltCard>
      <div className="card-head ui-v2">
        <div className="card-title">
          <h5 className="title">Balance Summary</h5>
        </div>
        <div className="card-tools">
          <ul className="card-tools-nav">
            <li onClick={() => setTab("current")} className={tab === "current" ? "active" : ""}>
              <a href="#tabs" onClick={(ev) => ev.preventDefault()}>
                This Month
              </a>
            </li>
            <li onClick={() => setTab("month")} className={tab === "month" ? "active" : ""}>
              <a href="#tabs" onClick={(ev) => ev.preventDefault()}>
                Months
              </a>
            </li>
            <li onClick={() => setTab("year")} className={tab === "year" ? "active" : ""}>
              <a href="#tabs" onClick={(ev) => ev.preventDefault()}>
                Years
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="nk-wg4">
        <div className="nk-wg4-group flex-lg-nowrap justify-between g-3">
          <div className="nk-wg4-item">
            <div className="nk-wg4-group g-3">
              <div className="nk-wg4-sub">
                <div className="sub-text">
                  <div className="dot dot-lg sq" style={{ background: "rgb(92, 224, 170)" }}></div>{" "}
                  <span>Total Received</span>
                </div>
                <div className="lead-text-lg">
                  2.010550 <span className="currency currency-btc">BTC</span>
                </div>
              </div>
              <div className="nk-wg4-sub">
                <div className="sub-text">
                  <div className="dot dot-lg sq" style={{ background: "rgb(121, 139, 255" }}></div> <span>Total Send</span>
                </div>
                <div className="lead-text-lg">
                  2.010550<span className="currency currency-btc">BTC</span>
                </div>
              </div>
              <div className="nk-wg4-sub">
                <div className="sub-text">
                  <div className="dot dot-lg sq" style={{ background: "rgb(246, 202, 62)" }}></div>
                  <span>Total Withdraw</span>
                </div>
                <div className="lead-text-lg">
                  2.010550<span className="currency currency-btc">BTC</span>
                </div>
              </div>
            </div>
          </div>
          <div className="nk-wg4-item text-lg-end">
            <div className="nk-wg4-note">
              Total <span>35,405</span> transaction made
            </div>
          </div>
        </div>
      </div>
      <div className="nk-ck2">
        <div className="chartjs-size-monitor">
          <div className="chartjs-size-monitor-expand">
            <div className=""></div>
          </div>
          <div className="chartjs-size-monitor-shrink">
            <div className=""></div>
          </div>
        </div>
        <BalanceSummaryChart state={tab} />
      </div>
    </PreviewAltCard>
  );
};

export default BalanceSummary;
