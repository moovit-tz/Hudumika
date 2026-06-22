import React from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import {
  BlockHeadContent,
  BlockTitle,
  BlockHead,
  Block,
  Icon,
  BlockDes,
  PreviewAltCard,
} from "@/components/Component";
import { Link } from "react-router-dom";

const KycApplications = () => {
  return (
    <React.Fragment>
      <Head title="KYC Applications"></Head>
      <Content size="lg">
        <div className="kyc-app wide-sm m-auto">
          <BlockHead size="lg" className="wide-xs mx-auto">
            <BlockHeadContent className="text-center">
              <BlockTitle tag="h2" className="fw-normal">
                KYC Verification
              </BlockTitle>
              <BlockDes>
                <p>
                  To comply with regulation each participant will have to go through indentity verification (KYC/AML) to
                  prevent fraud causes.{" "}
                </p>
              </BlockDes>
            </BlockHeadContent>
          </BlockHead>

          <Block>
            <PreviewAltCard className="card-bordered" bodyClass="card-inner-lg">
              <div className="nk-kyc-app p-sm-2 text-center">
                <div className="nk-kyc-app-icon">
                  <Icon name="files"></Icon>
                </div>
                <div className="nk-kyc-app-text mx-auto">
                  <p className="lead">
                    You have not submitted your necessary documents to verify your identity. In order to purchase our
                    tokens, please verify your identity.
                  </p>
                </div>
                <div className="nk-kyc-app-action">
                  <Link to={`/invest/kyc-form`} className="btn btn-lg btn-primary">
                    Click here to complete your KYC
                  </Link>
                </div>
              </div>
            </PreviewAltCard>
            <div className="text-center pt-4">
              <p>
                If you have any question, please contact our support team{" "}
                <a href="mailto:info@softnio.com">info@softnio.com</a>
              </p>
            </div>
          </Block>
        </div>
      </Content>
    </React.Fragment>
  );
};

export default KycApplications;
