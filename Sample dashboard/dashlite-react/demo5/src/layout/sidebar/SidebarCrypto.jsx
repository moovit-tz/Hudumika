import React from "react";
import classNames from "classnames";
import SimpleBar from "simplebar-react";
import Logo from "../logo/Logo";
import Menu from "../menu/Menu";
import Toggle from "./Toggle";
import { Button, DropdownToggle, UncontrolledDropdown } from "reactstrap";
import { Icon, LangDropdown } from "@/components/Component";
import { Link } from "react-router";

import { useTheme, useThemeUpdate } from '@/layout/provider/Theme';

const Sidebar = ({ fixed, className, menuData, ...props }) => {

  
  const theme = useTheme();
  const themeUpdate = useThemeUpdate();

  const classes = classNames({
    "nk-sidebar": true,
    "nk-sidebar-fixed": fixed,
    "nk-sidebar-active": theme.sidebarVisibility,
    "nk-sidebar-mobile": theme.sidebarMobile,
    [`is-light`]: theme.sidebar === "white",
    [`is-${theme.sidebar}`]: theme.sidebar !== "white" && theme.sidebar !== "light",
    [`${className}`]: className,
  });

  return (
    <>
    <div className={classes}>
      <div className="nk-sidebar-element nk-sidebar-head">
        <div className="nk-sidebar-brand">
          <Logo />
        </div>
        <div className="nk-menu-trigger me-n2">
          <Toggle className="nk-nav-toggle nk-quick-nav-icon d-xl-none" icon="arrow-left" click={themeUpdate.sidebarVisibility} />
        </div>
      </div>
      <SimpleBar className="nk-sidebar-body">
        <div className="nk-sidebar-content">
            <React.Fragment>
              <div className="nk-sidebar-widget d-none d-xl-block">
                <div className="user-account-info between-center">
                  <div className="user-account-main">
                    <h6 className="overline-title-alt">Available Balance</h6>
                    <div className="user-balance">
                      2.014095 <small className="currency currency-btc">BTC</small>
                    </div>
                    <div className="user-balance-alt">
                      18,934.84 <span className="currency currency-btc">BTC</span>
                    </div>
                  </div>
                  <a href="#chart" onClick={(ev) => ev.preventDefault()} className="btn btn-white btn-icon btn-light">
                    <Icon name="line-chart"></Icon>
                  </a>
                </div>
                <ul className="user-account-data gy-1">
                  <li>
                    <div className="user-account-label">
                      <span className="sub-text">Profits (7d)</span>
                    </div>
                    <div className="user-account-value">
                      <span className="lead-text">
                        + 0.0526 <span className="currency currency-btc">BTC</span>
                      </span>
                      <span className="text-success ms-2">
                        3.1% <Icon name="arrow-long-up"></Icon>
                      </span>
                    </div>
                  </li>
                  <li>
                    <div className="user-account-label">
                      <span className="sub-text">Deposit in orders</span>
                    </div>
                    <div className="user-account-value">
                      <span className="sub-text">
                        0.005400 <span className="currency currency-btc">BTC</span>
                      </span>
                    </div>
                  </li>
                </ul>
                <div className="user-account-actions">
                  <ul className="g-3">
                    <li>
                      <Button color="primary" size="lg">
                        <span>Deposit</span>
                      </Button>
                    </li>
                    <li>
                      <Button color="warning" size="lg">
                        <span>Withdraw</span>
                      </Button>
                    </li>
                  </ul>
                </div>
              </div>
            </React.Fragment>
          <div className="nk-sidebar-menu">
            <Menu data={menuData} />
          </div>
          <div className="nk-sidebar-widget">
            <div className="widget-title">
              <h6 className="overline-title">
                Crypto Accounts <span>(4)</span>
              </h6>
              <Link to={`/crypto/wallets`}  className="link">
                View All
              </Link>
            </div>
            <ul className="wallet-list">
              <li className="wallet-item">
                <Link to={`/crypto/walletsbtc`}>
                  <div className="wallet-icon">
                    <Icon name="sign-kobo"></Icon>
                  </div>
                  <div className="wallet-text">
                    <h6 className="wallet-name">NioWallet</h6>
                    <span className="wallet-balance">
                      30.959040 <span className="currency currency-nio">NIO</span>
                    </span>
                  </div>
                </Link>
              </li>
              <li className="wallet-item">
                <Link to={`/crypto/walletsbtc`}>
                  <div className="wallet-icon">
                    <Icon name="sign-btc"></Icon>
                  </div>
                  <div className="wallet-text">
                    <h6 className="wallet-name">Bitcoin Wallet</h6>
                    <span className="wallet-balance">
                      0.0495950 <span className="currency currency-btc">BTC</span>
                    </span>
                  </div>
                </Link>
              </li>
              <li className="wallet-item wallet-item-add">
                <a href="#links" onClick={(ev) => ev.preventDefault()}>
                  <div className="wallet-icon">
                    <Icon name="plus"></Icon>
                  </div>
                  <div className="wallet-text">
                    <h6 className="wallet-name">Add another wallet</h6>
                  </div>
                </a>
              </li>
            </ul>
          </div>
          <div className="nk-sidebar-footer">
            <ul className="nk-menu nk-menu-footer">
              <li className="nk-menu-item">
                <a href="#link" className="nk-menu-link" onClick={(ev) => ev.preventDefault()}>
                  <span className="nk-menu-icon">
                    <Icon name="help-alt"></Icon>
                  </span>
                  <span className="nk-menu-text">Support</span>
                </a>
              </li>
              <li className="nk-menu-item ms-auto">
                <UncontrolledDropdown direction="up">
                  <DropdownToggle
                    tag="a"
                    href="#toggle"
                    onClick={(ev) => ev.preventDefault()}
                    className="nk-menu-link dropdown-indicator has-indicator"
                  >
                    <span className="nk-menu-icon">
                      <Icon name="globe"></Icon>
                    </span>
                    <span className="nk-menu-text">English</span>
                  </DropdownToggle>
                  <LangDropdown size="sm" />
                </UncontrolledDropdown>
              </li>
            </ul>
          </div>
        </div>
      </SimpleBar>
    </div>
    {theme.sidebarVisibility && <div 
      onClick={themeUpdate.sidebarVisibility}
       className="nk-sidebar-overlay"></div>}
    </>
  );
};
export default Sidebar;
