import React, { useState } from "react";
import { DropdownItem, DropdownMenu, DropdownToggle, UncontrolledDropdown } from "reactstrap";
import { PreviewAltCard } from "@/components/Component";
import { AvailableBalanceCharts } from "@/components/partials/charts/panel/PanelCharts";

const AvailableBalance = () => {
  const [currency, setCurrency] = useState("USD");
  return (
    <PreviewAltCard>
      <div className="nk-wg1 mb-3">
        <div className="nk-wg1-group g-2">
          <div className="nk-wg1-item me-xl-4">
            <div className="nk-wg1-title">
              Available Balance /{" "}
              <UncontrolledDropdown>
                <DropdownToggle
                  className="dropdown-indicator-caret"
                  tag="a"
                  href="toggle"
                  onClick={(ev) => ev.preventDefault()}
                >
                  {currency}
                </DropdownToggle>
                <DropdownMenu className="dropdown-menu-xxs dropdown-menu-center">
                  <ul className="link-list-plain sm text-center">
                    <li onClick={() => setCurrency("BTC")}>
                      <DropdownItem tag="a" href="#currency" onClick={(ev) => ev.preventDefault()}>
                        BTC
                      </DropdownItem>
                    </li>
                    <li onClick={() => setCurrency("ETH")}>
                      <DropdownItem tag="a" href="#currency" onClick={(ev) => ev.preventDefault()}>
                        ETH
                      </DropdownItem>
                    </li>
                    <li onClick={() => setCurrency("YEN")}>
                      <DropdownItem tag="a" href="#currency" onClick={(ev) => ev.preventDefault()}>
                        YEN
                      </DropdownItem>
                    </li>
                  </ul>
                </DropdownMenu>
              </UncontrolledDropdown>
            </div>
            <div className="nk-wg1-amount">
              <div className="amount">
                2.010550 <small className="currency currency-btc">{currency}</small>
              </div>
            </div>
          </div>
          <div className="nk-wg1-item ms-lg-auto">
            <div className="nk-wg1-title">In this month</div>
            <div className="nk-wg1-group g-2">
              <div className="nk-wg1-sub">
                <div className="sub-text">
                  <span>Send</span>
                  <div className="dot" style={{ background: "rgb(156, 171, 255)" }}></div>
                </div>
                <div className="lead-text">762,954.63</div>
              </div>
              <div className="nk-wg1-sub">
                <div className="sub-text">
                  <span>Receive</span>
                  <div className="dot" style={{ background: "rgb(186, 174, 255)" }}></div>
                </div>
                <div className="lead-text">762,954.63</div>
              </div>
              <div className="nk-wg1-sub">
                <div className="sub-text">
                  <span>Withdraw</span>
                  <div className="dot" style={{ background: "rgb(167, 204, 255)" }}></div>
                </div>
                <div className="lead-text">762,954.63</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="nk-ck1">
        <div className="chartjs-size-monitor">
          <div className="chartjs-size-monitor-expand">
            <div className=""></div>
          </div>
          <div className="chartjs-size-monitor-shrink">
            <div className=""></div>
          </div>
        </div>
        <AvailableBalanceCharts currency={currency} />
      </div>
    </PreviewAltCard>
  );
};

export default AvailableBalance;
