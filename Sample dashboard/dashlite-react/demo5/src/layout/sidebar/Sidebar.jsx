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
          <div className="nk-sidebar-menu">
            <Menu  data={menuData} />
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
