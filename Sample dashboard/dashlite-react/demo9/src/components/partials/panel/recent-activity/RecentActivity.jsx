import React, { useState, useEffect } from "react";
import { recentActivityData } from "./Data";
import { Card } from "reactstrap";
import { Icon } from "@/components/Component";

const RecentActivity = () => {
  const [data, setData] = useState(recentActivityData);
  const [tab, setTab] = useState("all");

  useEffect(() => {
    let filteredData;
    if (tab === "buy") {
      filteredData = recentActivityData.filter((item) => item.desc.split(" ")[0] === "Buy");
    } else if (tab === "sell") {
      filteredData = recentActivityData.filter((item) => item.desc.split(" ")[0] === "Sell");
    } else {
      filteredData = recentActivityData;
    }
    setData(filteredData);
  }, [tab]);

  return (
    <React.Fragment>
      <div className="card-head">
        <div className="card-title mb-0">
          <h5 className="title">Recent Activities</h5>
        </div>
        <div className="card-tools">
          <ul className="card-tools-nav">
            <li onClick={() => setTab("buy")} className={tab === "buy" ? "active" : ""}>
              <a href="#tabs" onClick={(ev) => ev.preventDefault()}>
                Buy
              </a>
            </li>
            <li onClick={() => setTab("sell")} className={tab === "sell" ? "active" : ""}>
              <a href="#tabs" onClick={(ev) => ev.preventDefault()}>
                Sell
              </a>
            </li>
            <li onClick={() => setTab("all")} className={tab === "all" ? "active" : ""}>
              <a href="#tabs" onClick={(ev) => ev.preventDefault()}>
                All
              </a>
            </li>
          </ul>
        </div>
      </div>
      <Card className=" tranx-list">
        {data.map((item) => {
          return (
            <div className="tranx-item" key={item.ref}>
              <div className="tranx-col">
                <div className="tranx-info">
                  <div className="tranx-data">
                    <div className="tranx-label">
                      {item.desc} <Icon name={item.icon1} className="tranx-icon sm"></Icon>
                    </div>
                    <div className="tranx-date">
                      {item.date} {item.time}
                    </div>
                  </div>
                </div>
              </div>
              <div className="tranx-col">
                <div className="tranx-amount">
                  <div className="number">
                    {item.amount} <span className="currency currency-btc">BTC</span>
                  </div>
                  <div className="number-sm">
                    {item.usd} <span className="currency currency-usd">USD</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </Card>
    </React.Fragment>
  );
};

export default RecentActivity;
