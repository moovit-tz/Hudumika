import React from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockContent, BlockHead, BlockHeadContent, BlockTitle, BlockDes, Col, Icon, Row,
  InputSwitch, } from "@/components/Component";
import { Link } from "react-router-dom";

const ProfileNotify = () => {
  return (
    <React.Fragment>
      <Head title="Profile Notifications"></Head>
      <Block>
        <BlockHead size="md">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle tag="h4">Notification Settings</BlockTitle>
              <BlockDes>
                <p>You will get only notification what have enabled.</p>
              </BlockDes>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle tag="h6">Security Alerts</BlockTitle>
              <BlockDes>
                <p>You will get only those email notification what you want.</p>
              </BlockDes>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        <BlockContent>
          <div className="gy-3">
            <div className="g-item">
              <div className="custom-control custom-switch">
                <InputSwitch id="custom-switch" checked label="Email me whenever encounter unusual activity" />
              </div>
            </div>
            <div className="g-item">
              <div className="custom-control custom-switch">
                <InputSwitch id="custom-switch2" label="Email me if new browser is used to sign in" />
              </div>
            </div>
          </div>
        </BlockContent>

        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle tag="h6">News</BlockTitle>
              <BlockDes>
                <p>You will get only those email notification what you want.</p>
              </BlockDes>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        <BlockContent>
          <div className="gy-3">
            <div className="g-item">
              <div className="custom-control custom-switch">
                <InputSwitch id="custom-switch3" checked label="Notify me by email about sales and latest news" />
              </div>
            </div>
            <div className="g-item">
              <div className="custom-control custom-switch">
                <InputSwitch id="feature-update" label="Email me about new features and updates" />
              </div>
            </div>
            <div className="g-item">
              <div className="custom-control custom-switch">
                <InputSwitch id="account-tips" checked label="Email me about tips on using account" />
              </div>
            </div>
          </div>
        </BlockContent>
      </Block>
    </React.Fragment>
  );
};

export default ProfileNotify;
