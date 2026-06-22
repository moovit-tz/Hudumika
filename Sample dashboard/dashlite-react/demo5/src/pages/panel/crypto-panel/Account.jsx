import React from "react";
import Head from "@/layout/head/Head";
import Content from "@/layout/content/Content";
import AvailableBalance from "@/components/partials/panel/available-balance/AvailableBalance";
import BalanceSummary from "@/components/partials/panel/balance-summary/BalanceSummary";
import {
  Block,
  BlockDes,
  BlockHead,
  BlockHeadContent,
  BlockHeadSub,
  BlockTitle,
  Icon,
} from "@/components/Component";

const Account = () => {
  return (
    <React.Fragment>
      <Head title="Crypto Dashboard"></Head>
      <Content>
        <BlockHead>
            <BlockHeadSub>Account Balance</BlockHeadSub>
          <div className="nk-block-between-md g-4">
            <BlockHeadContent>
                <BlockTitle tag="h2" className="fw-normal">
                  My Account
                </BlockTitle>
              <BlockDes>
                <p>At a glance summary of your account. Have fun!</p>
              </BlockDes>
            </BlockHeadContent>
            <BlockHeadContent>
              <ul className="nk-block-tools gx-3">
                <li className="btn-wrap">
                  <a
                    href="#btn"
                    onClick={(ev) => ev.preventDefault()}
                    className="btn btn-icon btn-xl btn-dim btn-outline-light"
                  >
                    <Icon name="arrow-from-right"></Icon>
                  </a>
                  <span className="btn-extext">Send</span>
                </li>
                <li className="btn-wrap">
                  <a href="#btn" onClick={(ev) => ev.preventDefault()} className="btn btn-icon btn-xl btn-success">
                    <Icon name="wallet-in"></Icon>
                  </a>
                  <span className="btn-extext">Deposit</span>
                </li>
                <li className="btn-wrap">
                  <a href="#btn" onClick={(ev) => ev.preventDefault()} className="btn btn-icon btn-xl btn-warning">
                    <Icon name="wallet-out"></Icon>
                  </a>
                  <span className="btn-extext">Withdraw</span>
                </li>
              </ul>
            </BlockHeadContent>
          </div>
        </BlockHead>

        <Block>
          <AvailableBalance />
          <BalanceSummary />
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default Account;
