import React from "react";
import Head from "@/layout/head/Head";
import Content from "@/layout/content/Content";
import { Button, Card, Col, DropdownItem, DropdownMenu, DropdownToggle, Row, UncontrolledDropdown } from "reactstrap";
import {
  Block,
  BlockDes,
  BlockHead,
  BlockHeadContent,
  BlockHeadSub,
  BlockTitle,
  Icon,
} from "@/components/Component";
import Wallet from "@/components/partials/panel/wallet/Wallet";

const Wallets = () => {
  return (
    <React.Fragment>
      <Head title="Crypto Dashboard"></Head>
      <Content>
        <BlockHead>
          <BlockHeadSub>Account Wallet</BlockHeadSub>
          <div className="nk-block-between-md g-4">
            <BlockHeadContent>
              <BlockTitle tag="h2" className="fw-normal">
                Wallet / Assets
              </BlockTitle>
              <BlockDes>
                <p>Here is the list of your assets / wallets!</p>
              </BlockDes>
            </BlockHeadContent>
            <BlockHeadContent>
              <ul className="nk-block-tools gx-3">
                <li>
                  <UncontrolledDropdown className="opt-menu-md">
                    <DropdownToggle tag="a" className="btn btn-dim btn-outline-light btn-icon">
                      <Icon name="setting"></Icon>
                    </DropdownToggle>
                    <DropdownMenu className="dropdown-menu-xs" end>
                      <ul className="link-list-plain sm">
                        <li>
                          <DropdownItem tag="a">
                            <span>Display</span>
                          </DropdownItem>
                        </li>
                        <li>
                          <DropdownItem tag="a">
                            <span>Show</span>
                          </DropdownItem>
                        </li>
                      </ul>
                    </DropdownMenu>
                  </UncontrolledDropdown>
                </li>
                <li>
                  <Button color="primary">
                    <span>Send</span> <Icon name="arrow-long-right"></Icon>
                  </Button>
                </li>
                <li>
                  <Button color="dim" className="btn-outline-light">
                    <span>Withdraw</span> <Icon name="arrow-long-right" className="d-none d-sm-inline-block"></Icon>
                  </Button>
                </li>
              </ul>
            </BlockHeadContent>
          </div>
        </BlockHead>

        <Block>
          <BlockHead size="sm">
            <BlockHeadContent>
              <BlockTitle tag="h5">Crypto Accounts</BlockTitle>
            </BlockHeadContent>
          </BlockHead>
          <Row className="g-gs">
            <Col sm="6" lg="4">
              <Card className="card-bordered is-dark">
                <Wallet
                  className="is-default"
                  icon="sign-kobo"
                  title="NioWallet"
                  firstAmount="40.509505"
                  firstCurrency="NIO"
                  secondAmount="8,924.63"
                  secondCurrency="USD"
                />
              </Card>
            </Col>
            <Col sm="6" lg="4">
              <Card className="card-bordered">
                <Wallet
                  icon="sign-eth"
                  title="Ethereum Wallet"
                  firstAmount="0.452058"
                  firstCurrency="ETH"
                  secondAmount="1,583.25"
                  secondCurrency="USD"
                />
              </Card>
            </Col>
            <Col sm="6" lg="4">
              <Card className="card-bordered">
                <Wallet
                  icon="sign-btc"
                  title="Bitcoin Wallet"
                  firstAmount="4.434953"
                  firstCurrency="BTC"
                  secondAmount="28,247.63"
                  secondCurrency="USD"
                />
              </Card>
            </Col>
          </Row>
        </Block>
        <Block size="lg">
          <BlockHead size="sm">
            <BlockHeadContent>
              <BlockTitle tag="h5">Fiat Accounts</BlockTitle>
            </BlockHeadContent>
          </BlockHead>
          <Row className="g-gs">
            <Col sm="6" lg="4">
              <Card className="card-bordered">
                <Wallet
                  className="is-default"
                  icon="sign-usd"
                  title="USD Account"
                  firstAmount="12,495.90"
                  firstCurrency="USD"
                  secondAmount="12,495.90"
                  secondCurrency="USD"
                />
              </Card>
            </Col>
            <Col sm="6" lg="4">
              <Card className="card-bordered">
                <Wallet
                  icon="sign-eur"
                  title="EUR Account"
                  firstAmount="12,495.90"
                  firstCurrency="EUR"
                  secondAmount="11,495.90"
                  secondCurrency="USD"
                />
              </Card>
            </Col>
            <Col sm="6" lg="4">
              <Card className="card-bordered dashed h-100">
                <div className="nk-wgw-add">
                  <div className="nk-wgw-inner">
                    <a href="#">
                      <div className="add-icon">
                        <em className="icon ni ni-plus"></em>
                      </div>
                      <h6 className="title">Add New Wallet</h6>
                    </a>
                    <span className="sub-text">You can add your more wallet in your account to manage separetly.</span>
                  </div>
                </div>
              </Card>
            </Col>
          </Row>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default Wallets;
