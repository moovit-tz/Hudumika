import React, { useState } from "react";
import Head from "@/layout/head/Head";
import Content from "@/layout/content/Content";
import { Block, BlockBetween, BlockDes, BlockHead, BlockHeadContent, BlockTitle, Icon } from "@/components/Component";
import { 
  Button, 
  Input, 
  Label,
  UncontrolledDropdown,
  DropdownMenu,
  DropdownToggle,
  DropdownItem,
  Card,
  Badge
  } from "reactstrap";
import { Link } from "react-router-dom";
import btc from '@/images/coins/btc.svg'
import eth from '@/images/coins/eth.svg'

const Orders = () => {
   // function to toggle the search option
   const toggle = () => setonSearch(!onSearch);
   const [onSearch, setonSearch] = useState(true);
  return (
    <React.Fragment>
      <Head title="Crypto Dashboard"></Head>
      <Content>
        <BlockHead>
          <BlockBetween size="md" className="g-4">
            <BlockHeadContent>
              <BlockTitle tag="h2" className="fw-normal">Your Orders</BlockTitle>
              <BlockDes>
                <p>See full list of your orders of your account</p>
              </BlockDes>
            </BlockHeadContent>
            <BlockHeadContent>
              <ul className="nk-block-tools gx-3">
                <li className="order-md-last">
                  <Button color="primary">
                    <span>Buy Coin</span> <Icon name="arrow-long-right"></Icon>
                  </Button>
                </li>
                <li>
                  <Button color="white" className="btn btn-white btn-light">
                    <Icon name="download-cloud"></Icon><span><span className="d-none d-sm-inline-block">Get</span> Statement</span>
                  </Button>
                </li>
              </ul>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>
        <ul className="nk-nav nav nav-tabs">
          <li className="nav-item">
            <a 
            className="nav-link active" 
            href="#" 
            onClick={(ev) => {
              ev.preventDefault();
            }}>
              History
            </a>
          </li>
          <li className="nav-item">
            <a 
            className="nav-link" 
            href="#" 
            onClick={(ev) => {
              ev.preventDefault();
            }}>
              Sells
            </a>
          </li>
          <li className="nav-item">
            <a 
            className="nav-link" 
            href="#" 
            onClick={(ev) => {
              ev.preventDefault();
            }}>
              Scheduled 
              <Badge color="primary">3</Badge>
            </a>
          </li>
      </ul>
      <Block size="sm">
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle tag="h6">All Orders</BlockTitle>
            </BlockHeadContent>
            <ul className="nk-block-tools gx-3">
              <li>
                <div className="form-group">
                    <div className="custom-control custom-control-xs custom-checkbox">
                        <Input type="checkbox" className="custom-control-input" id="checkbox" />
                        <Label className="custom-control-label" for="checkbox"><span className="d-none d-sm-inline-block">Show</span> Cancelled</Label>
                    </div>
                </div>
              </li>
              <li>
                <a href="#" onClick={toggle} className="search-toggle toggle-search btn btn-icon btn-trigger">
                  <Icon name="search"></Icon>
                </a>
              </li>
              <li>
                <UncontrolledDropdown>
                  <DropdownToggle tag="a" className="dropdown-toggle btn btn-icon btn-trigger mx-n2">
                    <Icon name="setting"></Icon>
                  </DropdownToggle>
                  <DropdownMenu className="dropdown-menu-xs" end>
                    <ul className="link-check">
                      <li>
                        <span>Show</span>
                      </li>
                      <li className="acrive">
                        <DropdownItem
                          tag="a"
                          href="#dropdownitem"
                          onClick={(ev) => {
                            ev.preventDefault();
                          }}
                        >
                          10
                        </DropdownItem>
                      </li>
                      <li>
                        <DropdownItem
                          tag="a"
                          href="#dropdownitem"
                          onClick={(ev) => {
                            ev.preventDefault();
                          }}
                        >
                          15
                        </DropdownItem>
                      </li>
                    </ul>
                    <ul className="link-check">
                      <li>
                        <span>Order</span>
                      </li>
                      <li className="active">
                        <DropdownItem
                          tag="a"
                          href="#dropdownitem"
                          onClick={(ev) => {
                            ev.preventDefault();
                          }}
                        >
                          DESC
                        </DropdownItem>
                      </li>
                      <li>
                        <DropdownItem
                          tag="a"
                          href="#dropdownitem"
                          onClick={(ev) => {
                            ev.preventDefault();
                          }}
                        >
                          ASC
                        </DropdownItem>
                      </li>
                    </ul>
                  </DropdownMenu>
                </UncontrolledDropdown>
              </li>
            </ul>
          </BlockBetween>
          <div className={`search-wrap search-wrap-extend ${!onSearch ? "active" : ""}`}>
            <div className="search-content">
              <Link
                to="#"
                className="search-back btn btn-icon toggle-search"
                onClick={() => {
                  toggle();
                }}
              >
                <Icon name="arrow-left"></Icon>
              </Link>
              <Input
                type="text"
                className="form-control form-control-sm border-transparent form-focus-none"
                placeholder="Quick search by user"
              />
              <Link 
                to="#"
                className="search-submit btn btn-icon">
                <Icon name="search"></Icon>
              </Link>
            </div>
          </div>
        </BlockHead>
        <h6 className="lead-text text-soft">November, 2019</h6>
        <Card className="tranx-list tranx-list-stretch card-bordered">
          <div className="tranx-item">
            <div className="tranx-col">
                <div className="tranx-info">
                    <div className="tranx-badge">
                        <span className="tranx-icon">
                            <img src={btc} alt="" />
                        </span>
                    </div>
                    <div className="tranx-data">
                        <div className="tranx-label">Buy Bitcoin</div>
                        <div className="tranx-date">Nov 12, 2019 11:34 PM</div>
                    </div>
                </div>
            </div>
            <div className="tranx-col">
                <div className="tranx-amount">
                    <div className="number">0.5384 <span className="currency currency-btc">BTC</span></div>
                    <div className="number-sm">3,980.93 <span className="currency currency-usd">USD</span></div>
                </div>
            </div>
          </div>
          <div className="tranx-item">
                <div className="tranx-col">
                    <div className="tranx-info">
                        <div className="tranx-badge">
                            <span className="tranx-icon">
                                <img src={eth} alt="" />
                            </span>
                        </div>
                        <div className="tranx-data">
                            <div className="tranx-label">Buy Ethereum </div>
                            <div className="tranx-date">Nov 12, 2019 11:34 PM</div>
                        </div>
                    </div>
                </div>
                <div className="tranx-col">
                    <div className="tranx-amount">
                        <div className="number">0.5384 <span className="currency currency-btc">BTC</span></div>
                        <div className="number-sm">3,980.93 <span className="currency currency-usd">USD</span></div>
                    </div>
                </div>
            </div>
        </Card>
        <h6 className="lead-text text-soft">October, 2019</h6>
        <Card className="tranx-list tranx-list-stretch card-bordered">
          <div className="tranx-item">
            <div className="tranx-col">
                <div className="tranx-info">
                    <div className="tranx-badge">
                        <span className="tranx-icon">
                            <img src={btc} alt="" />
                        </span>
                    </div>
                    <div className="tranx-data">
                        <div className="tranx-label">Buy Bitcoin</div>
                        <div className="tranx-date">Nov 12, 2019 11:34 PM</div>
                    </div>
                </div>
            </div>
            <div className="tranx-col">
                <div className="tranx-amount">
                    <div className="number">0.5384 <span className="currency currency-btc">BTC</span></div>
                    <div className="number-sm">3,980.93 <span className="currency currency-usd">USD</span></div>
                </div>
            </div>
          </div>
          <div className="tranx-item">
                <div className="tranx-col">
                    <div className="tranx-info">
                        <div className="tranx-badge">
                            <span className="tranx-icon">
                                <img src={eth} alt="" />
                            </span>
                        </div>
                        <div className="tranx-data">
                            <div className="tranx-label">Buy Ethereum </div>
                            <div className="tranx-date">Nov 12, 2019 11:34 PM</div>
                        </div>
                    </div>
                </div>
                <div className="tranx-col">
                    <div className="tranx-amount">
                        <div className="number">0.5384 <span className="currency currency-btc">BTC</span></div>
                        <div className="number-sm">3,980.93 <span className="currency currency-usd">USD</span></div>
                    </div>
                </div>
            </div>
        </Card>
        <div className="text-center pt-4">
            <Link 
            to="#" 
            onClick={(ev) => {
              ev.preventDefault();
            }} 
            className="link link-soft">
              <Icon name="redo"></Icon><span>Load More</span>
            </Link>
        </div>
      </Block>
      </Content>
    </React.Fragment>
  );
};

export default Orders;
