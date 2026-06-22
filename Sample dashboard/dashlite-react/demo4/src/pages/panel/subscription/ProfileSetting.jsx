import React from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockHead, BlockHeadContent, BlockTitle, BlockDes, Col, Icon, Row,
  InputSwitch,
  Button, } from "@/components/Component";
import { Link } from "react-router-dom";
import { Card, Badge } from "reactstrap";
import loginData from "./data/loginlog"

const ProfileSetting = () => {
  return (
    <React.Fragment>
      <Head title="Profile Setting"></Head>

      <Block>
        <BlockHead size="md">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle tag="h4">Security Settings</BlockTitle>
              <BlockDes>
                <p>These settings will help you to keep your account secure.</p>
              </BlockDes>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>
        <Card className="card-bordered">
          <div className="card-inner-group">
            <div className="card-inner">
              <div className="between-center flex-wrap flex-md-nowrap g-3">
                <div className="nk-block-text">
                  <h6>Save my Activity Logs</h6>
                  <p>You can save your all activity logs including unusual activity detected.</p>
                </div>
                <div className="nk-block-actions">
                  <ul className="align-center gx-3">
                    <li className="order-md-last">
                      <div className="custom-control custom-switch me-n2">
                        <InputSwitch checked id="activity-log" />
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="card-inner">
              <div className="between-center flex-wrap g-3">
                <div className="nk-block-text">
                  <h6>Change Password</h6>
                  <p>Set a unique password to protect your account.</p>
                </div>
                <div className="nk-block-actions flex-shrink-sm-0">
                  <ul className="align-center flex-wrap flex-sm-nowrap gx-3 gy-2">
                    <li className="order-md-last">
                      <Button color="primary">Change Password</Button>
                    </li>
                    <li>
                      <em className="text-soft text-date fs-12px">
                        Last changed: <span>Oct 2, 2019</span>
                      </em>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="card-body">
              <div className="between-center flex-wrap flex-md-nowrap g-3">
                <div className="nk-block-text">
                  <h6>
                    2 Factor Auth &nbsp; <Badge className="ms-0" color="success">Enabled</Badge>
                  </h6>
                  <p>
                    Secure your account with 2FA security. When it is activated you will need to enter not only your
                    password, but also a special code using app. You will receive this code via mobile application.{" "}
                  </p>
                </div>
                <div className="nk-block-actions">
                  <Button color="primary">Disable</Button>
                </div>
              </div>
            </div>
          </div>
        </Card>
        <BlockHead size="sm">
            <BlockHeadContent>
              <div className="nk-block-title-group">
                <BlockTitle tag="h6">Recent Activity</BlockTitle>
                <Link to={`/subscription/profile-activity`} className="link">See full log</Link>  
              </div>
              <BlockDes>
                <p>This information about the last login activity on your account.</p>
              </BlockDes>
            </BlockHeadContent>
        </BlockHead>
        <Card className="card-bordered">
            <table className="table table-ulogs">
              <thead className="table-light">
                <tr>
                  <th className="tb-col-os">
                    <span className="overline-title">
                      Browser <span className="d-sm-none">/ IP</span>
                    </span>
                  </th>
                  <th className="tb-col-ip">
                    <span className="overline-title">IP</span>
                  </th>
                  <th className="tb-col-time">
                    <span className="overline-title">Time</span>
                  </th>
                  <th className="tb-col-action">
                    <span className="overline-title">&nbsp;</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loginData.slice(0,3).map((item, idx) => {
                  return (
                    <tr key={idx}>
                      <td className="tb-col-os">{item.browser}</td>
                      <td className="tb-col-ip">
                        <span className="sub-text">{item.ip}</span>
                      </td>
                      <td className="tb-col-time">
                        <span className="sub-text">
                          {item.date} <span className="d-none d-sm-inline-block">{item.time}</span>
                        </span>
                      </td>
                      <td className="tb-col-action">
                        {item.action === true && (
                          <a
                            href="#delete"
                            onClick={(ev) => {
                              ev.preventDefault();
                            }}
                            className="link-cross me-sm-n1"
                          >
                            <Icon name="cross"></Icon>
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
      </Block>
    </React.Fragment>
  );
};

export default ProfileSetting;
