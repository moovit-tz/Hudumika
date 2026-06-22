import React from "react";
import Head from "@/layout/head/Head";
import { Card, Badge } from "reactstrap";
import {
  BlockDes,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  InputSwitch,
  Button,
  LoginLogTable,
  Block,
} from "@/components/Component";

const UserProfileSettingPage = () => {
  return (
    <React.Fragment>
      <Head title="Security Settings - Crypto"></Head>

      <Block className="pt-3 pt-md-5">
        <BlockHead>
          <BlockHeadContent>
            <BlockTitle tag="h5">Security Settings</BlockTitle>
            <BlockDes>
              <p>These settings will help you to keep your account secure.</p>
            </BlockDes>
          </BlockHeadContent>
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
                    <li>
                        <a href="#" className="link link-sm link-primary">See Recent Activity</a>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="card-inner">
                    <div className="between-center flex-wrap flex-md-nowrap g-3">
                        <div className="nk-block-text">
                            <h6>Security Pin Code</h6>
                            <p>You can set your pin code, we will ask you on your withdraw and transfer funds.</p>
                        </div>
                        <div className="nk-block-actions">
                            <div className="custom-control custom-switch me-n2">
                              <InputSwitch checked id="security-pin" />
                            </div>
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
        <BlockHead className="nk-block-head-sm">
          <BlockHeadContent>
            <div className="nk-block-title-group">
              <BlockTitle tag="h6">Recent Activity</BlockTitle>
                <a href="#" className="link">See full log</a>  
            </div>
            <BlockDes>
              <p>This information about the last login activity on your account.</p>
            </BlockDes>
          </BlockHeadContent>
        </BlockHead>
        <Card className="card-bordered">
          <LoginLogTable />
        </Card>
      </Block>
    </React.Fragment>
  );
};
export default UserProfileSettingPage;
