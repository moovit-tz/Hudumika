import React, { useState } from "react";
import Head from "@/layout/head/Head";
import Content from "@/layout/content/Content";
import { Button, Card, Col, Dropdown, DropdownItem, DropdownMenu, DropdownToggle, Row, UncontrolledDropdown } from "reactstrap";
import {
  Block,
  BlockContent,
  BlockDes,
  BlockHead,
  BlockHeadContent,
  BlockHeadSub,
  BlockTitle,
  Icon,
} from "@/components/Component";
import { Link } from "react-router-dom";
import BalanceFlow from "@/components/partials/panel/balance-flow/BalanceFlow";

const WalletsBtc = () => {
  const [currency, setCurrency] = useState("BTC");
  return (
    <React.Fragment>
      <Head title="Crypto Dashboard"></Head>
      <Content>
        <BlockHead>
          <div className="nk-block-between-md">
            <BlockHeadContent>
              <BlockHeadSub>
                <Link className="back-to" to={`/crypto/wallets`}>
                  <Icon name="arrow-left" />
                  <span>My Wallets</span>
                </Link>
              </BlockHeadSub>
              <div className="nk-wgwh">
                <Icon name="sign-btc" className="icon-circle icon-circle-lg icon" />
                  <div className="nk-wgwh-title h5">
                      Bitcoin Wallet
                      <small> / </small> 
                    <UncontrolledDropdown>
                      <DropdownToggle
                        className="dropdown-indicator-caret"
                        tag="a"
                        href="toggle"
                        onClick={(ev) => ev.preventDefault()}
                      >
                        <small>{currency}</small>
                      </DropdownToggle>
                      <DropdownMenu className="dropdown-menu dropdown-menu-xxs dropdown-menu-center">
                        <ul className="link-list-plain text-center">
                          <li onClick={() => setCurrency("USD")}>
                            <DropdownItem tag="a" href="#currency" onClick={(ev) => ev.preventDefault()}>
                              USD
                            </DropdownItem>
                          </li>
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
              </div>
            </BlockHeadContent>
          </div>
        </BlockHead>

        <Block>
          <div className="nk-block-between-md g-4">
            <BlockContent>
              <div className="nk-wg1">
                <div className="nk-wg1-group g-2">
                    <div className="nk-wg1-item me-xl-4">
                        <div className="nk-wg1-title text-soft">Available Balance</div>
                        <div className="nk-wg1-amount">
                            <div className="amount">2.010550 <small className="currency currency-usd">{currency}</small></div>
                            <div className="amount-sm">Balance in <span>2.010550 <span className="currency currency-usd">{currency}</span></span></div>
                        </div>
                    </div>
                </div>
              </div>
            </BlockContent>
            <BlockContent>
              <ul className="nk-block-tools gx-3">
                <li className="btn-wrap">
                  <a
                    href="#btn"
                    onClick={(ev) => ev.preventDefault()}
                    className="btn btn-icon btn-xl btn-dim btn-outline-light"
                  >
                    <Icon name="arrow-up-right"></Icon>
                  </a>
                  <span className="btn-extext">Send</span>
                </li>
                <li className="btn-wrap">
                  <a href="#btn" onClick={(ev) => ev.preventDefault()} className="btn btn-icon btn-xl btn-dim btn-outline-light">
                    <Icon name="arrow-down-left"></Icon>
                  </a>
                  <span className="btn-extext">Recive</span>
                </li>
                <li className="btn-wrap">
                  <a href="#btn" onClick={(ev) => ev.preventDefault()} className="btn btn-icon btn-xl btn-dark">
                    <Icon name="plus"></Icon>
                  </a>
                  <span className="btn-extext">Add Fund</span>
                </li>
                <li className="btn-wrap">
                  <a href="#btn" onClick={(ev) => ev.preventDefault()} className="btn btn-icon btn-xl btn-primary">
                    <Icon name="arrow-to-right"></Icon>
                  </a>
                  <span className="btn-extext">Withdraw</span>
                </li>
              </ul>
            </BlockContent>
          </div>
        </Block>
        <Block size="lg">
          <Row className="g-gs">
            <Col md="4">
              <Card className="card-bordered">
                <div className="card-inner">
                  <div className="nk-wg5">
                      <div className="nk-wg5-title">
                          <h6 className="title overline-title">Total Send</h6>
                      </div>
                      <div className="nk-wg5-text">
                          <div className="nk-wg5-amount">
                              <div className="amount">
                                  20.001500 <span className="currency currency-btc">BTC</span>
                              </div>
                              <div className="amount-sm">
                                  972,360.72 <span className="currency currency-usd">USD</span>
                              </div>
                          </div>
                      </div>
                      <div className="nk-wg5-foot">
                          <span className="text-soft">Last Send at <span className="text-base">19 Nov, 2019</span></span>
                      </div>
                  </div>
                </div>
              </Card>
            </Col>
            <Col md="4">
              <Card className="card-bordered">
                <div className="card-inner">
                  <div className="nk-wg5">
                      <div className="nk-wg5-title">
                          <h6 className="title overline-title">Total Recive</h6>
                      </div>
                      <div className="nk-wg5-text">
                          <div className="nk-wg5-amount">
                              <div className="amount">
                                  20.001500 <span className="currency currency-btc">BTC</span>
                              </div>
                              <div className="amount-sm">
                                  972,360.72 <span className="currency currency-usd">USD</span>
                              </div>
                          </div>
                      </div>
                      <div className="nk-wg5-foot">
                          <span className="text-soft">Last Recive at <span className="text-base">19 Nov, 2019</span></span>
                      </div>
                  </div>
                </div>
              </Card>
            </Col>
            <Col md="4">
              <Card className="card-bordered">
                <div className="card-inner">
                  <div className="nk-wg5">
                      <div className="nk-wg5-title">
                          <h6 className="title overline-title">Total Withdraw</h6>
                      </div>
                      <div className="nk-wg5-text">
                          <div className="nk-wg5-amount">
                              <div className="amount">
                                  20.001500 <span className="currency currency-btc">BTC</span>
                              </div>
                              <div className="amount-sm">
                                  972,360.72 <span className="currency currency-usd">USD</span>
                              </div>
                          </div>
                      </div>
                      <div className="nk-wg5-foot">
                          <span className="text-soft">Last Withdraw at <span className="text-base">19 Nov, 2019</span></span>
                      </div>
                  </div>
                </div>
              </Card>
            </Col>
          </Row>
        </Block>
        <Block size="lg">
          <Row className="g-gs">
            <Col xs="12">
              <BalanceFlow />
            </Col>
          </Row>  
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default WalletsBtc;
