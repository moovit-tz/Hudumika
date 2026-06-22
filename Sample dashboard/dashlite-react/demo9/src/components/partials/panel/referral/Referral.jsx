import React, { useState } from "react";
import CopyToClipboard from "react-copy-to-clipboard";
import { ReferralCharts } from "@/components/partials/charts/panel/PanelCharts";
import { Button, Card, DropdownItem, DropdownMenu, DropdownToggle, UncontrolledDropdown } from "reactstrap";
import { Icon, TooltipComponent } from "@/components/Component";

const Referral = () => {
  const [referral, setReferral] = useState("7");
  const [copy, setCopy] = useState(false);

  const onCopyClick = () => {
    setCopy(true);
    setTimeout(() => setCopy(false), 2000);
  };
  return (
    <Card className="">
      <div className="nk-refwg">
        <div className="nk-refwg-invite card-inner">
          <div className="nk-refwg-head g-3">
            <div className="nk-refwg-title">
              <h5 className="title">Refer Us &amp; Earn</h5>
              <div className="title-sub">Use the bellow link to invite your friends.</div>
            </div>
            <div className="nk-refwg-action">
              <Button color="primary">Invite</Button>
            </div>
          </div>
          <div className="nk-refwg-url">
            <div className={`form-control-wrap ${copy ? "clipboard-success" : ""}`}>
              <CopyToClipboard
                className="form-clip clipboard-init"
                text="https://dashlite.net/?ref=4945KD48"
                onCopy={onCopyClick}
              >
                <div>
                  <Icon name="copy" className="clipboard-icon"></Icon>
                  <span className="clipboard-text">{copy ? "Copied" : "Copy"}</span>
                </div>
              </CopyToClipboard>
              <div className="form-icon">
                <Icon name="link-alt"></Icon>
              </div>
              <input
                type="text"
                className="form-control copy-text"
                id="refUrl"
                defaultValue="https://dashlite.net/?ref=4945KD48"
              ></input>
            </div>
          </div>
        </div>
        <div className="nk-refwg-stats card-inner bg-lighter">
          <div className="nk-refwg-group g-3">
            <div className="nk-refwg-name">
              <h6 className="title">
                My Referral{" "}
                <TooltipComponent icon="info" id="referral-data" direction="right" text="Referral Information" />
              </h6>
            </div>
            <div className="nk-refwg-info g-3">
              <div className="nk-refwg-sub">
                <div className="title">{referral === "7" ? "394" : referral === "15" ? "490" : "720"}</div>
                <div className="sub-text">Total Joined</div>
              </div>
              <div className="nk-refwg-sub">
                <div className="title">{referral === "7" ? "548.49" : referral === "15" ? "720.25" : "860.36"}</div>
                <div className="sub-text">Referral Earn</div>
              </div>
            </div>
            <UncontrolledDropdown className="nk-refwg-more mt-n1 me-n1">
              <DropdownToggle className="btn btn-icon btn-trigger" color="transparent" tag="a">
                <Icon name="more-h"></Icon>
              </DropdownToggle>
              <DropdownMenu className="dropdown-menu-xs" end>
                <ul className="link-list-plain sm">
                  <li>
                    <DropdownItem
                      href="#link"
                      tag="a"
                      className={`${referral === "7" ? "active" : ""}`}
                      onClick={(ev) => {
                        ev.preventDefault();
                        setReferral("7");
                      }}
                    >
                      7 days
                    </DropdownItem>
                  </li>
                  <li>
                    <DropdownItem
                      href="#link"
                      tag="a"
                      className={`${referral === "15" ? "active" : ""}`}
                      onClick={(ev) => {
                        ev.preventDefault();
                        setReferral("15");
                      }}
                    >
                      15 Days
                    </DropdownItem>
                  </li>
                  <li>
                    <DropdownItem
                      href="#link"
                      tag="a"
                      className={`${referral === "30" ? "active" : ""}`}
                      onClick={(ev) => {
                        ev.preventDefault();
                        setReferral("30");
                      }}
                    >
                      30 Days
                    </DropdownItem>
                  </li>
                </ul>
              </DropdownMenu>
            </UncontrolledDropdown>
          </div>
          <div className="nk-refwg-ck">
            <ReferralCharts state={referral} />
          </div>
        </div>
      </div>
    </Card>
  );
};

export default Referral;
