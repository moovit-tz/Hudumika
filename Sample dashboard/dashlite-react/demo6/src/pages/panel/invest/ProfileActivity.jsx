import React from "react";
import Head from "@/layout/head/Head";
import Content from "@/layout/content/Content";
import {
  BlockDes,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Icon,
  LoginLogTable,
  BackTo,
  Block,
} from "@/components/Component";
import { Card } from "reactstrap";

const ProfileActivity = () => {
  return (
    <React.Fragment>
      <Head title="Profile Activity"></Head>
      <Content size="lg">
        <BlockHead>
          <BlockHeadContent>
            <BackTo icon="arrow-left" link="/invest/profile">
              {" "}
              My Profile{" "}
            </BackTo>
            <BlockTitle tag="h2" className="fw-normal">
              Login Activity
            </BlockTitle>
            <BlockDes>
              <p>
                Here is your last 20 login activities log.{" "}
                <span className="text-soft">
                  <Icon name="info" />
                </span>
              </p>
            </BlockDes>
          </BlockHeadContent>
        </BlockHead>

        <Block>
          <div className="nk-block-title-group mb-3">
            <BlockTitle>Activity on your account</BlockTitle>
            <a href="#link" onClick={(ev) => ev.preventDefault()} className="link link-danger">
              Clear log
            </a>
          </div>
          <Card className="card-bordered">
            <LoginLogTable />
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
};
export default ProfileActivity;
