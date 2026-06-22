import React from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockHead, BlockHeadContent, BlockTitle, BlockDes, Col, Icon, Row } from "@/components/Component";
import { Link } from "react-router-dom";
import {Card} from "reactstrap";
import loginData from "./data/loginlog"

const ProfileActivity = () => {
  return (
    <React.Fragment>
      <Head title="Profile Activity"></Head>
      <Content>
        <BlockHead size="md">
          <div className="nk-block-head-sub"><Link className="back-to" to={`/subscription/profile`}><Icon name="arrow-left"/><span>My Profile</span></Link></div>
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle tag="h2" className="fw-normal">Login Activity</BlockTitle>
              <BlockDes>
                <p>Here is your last 20 login activities log. <span className="text-soft"><Icon name="info" /></span></p>
              </BlockDes>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>
        <Block>
          <div className="nk-block-title-group mb-3">
              <h6 className="nk-block-title title">Activity on your account</h6>
              <a href="#" className="link link-danger">Clear log</a>
          </div>
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
                {loginData.map((item, idx) => {
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
      </Content>
    </React.Fragment>
  );
};

export default ProfileActivity;
