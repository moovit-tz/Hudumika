import React from "react";
import LogoSmall from "@/images/logo-small.png";
import LogoDark from "@/images/logo-dark-small.png";
import SimpleBar from "simplebar-react";
import classNames from "classnames";
import { DropdownMenu, DropdownToggle, UncontrolledDropdown } from "reactstrap";
import { Link, useLocation } from "react-router";
import { UserAvatar, LinkList, LinkItem, Icon, TooltipComponent } from "@/components/Component";

import { useTheme } from '@/layout/provider/Theme';

const dashboardLinks = [
  {
    icon: "dashboard",
    text: "Default Dashboard",
    link: "/",
  },
  {
    icon: "speed",
    text: "Sales Dashboard",
    link: "/sales",
  },
  {
    icon: "bitcoin-cash",
    text: "Crypto Dashboard",
    link: "/crypto",
  },
  {
    icon: "coins",
    text: "Invest Dashboard",
    link: "/invest",
  },
]

const applicationLinks = [
  {
    text: "Messages",
    link: "/app-messages",
    icon: "chat",
  },
  {
    text: "NioChat",
    link: "/app-chat",
    icon: "chat-circle",
  },
  {
    text: "Mailbox",
    link: "/app-inbox",
    icon: "inbox",
  },
  {
    text: "Calendar",
    link: "/app-calender",
    icon: "calendar",
  },
  {
    text: "Kanban",
    link: "/app-kanban",
    icon: "template",
  },
  {
    text: "File Manager",
    link: "/app-file-manager",
    icon: "folder",
  },
]

const Appbar = () => {
  
  const location = useLocation();
  const theme = useTheme(); 

  const appSidebarClass = classNames({
    "nk-apps-sidebar": true,
    [`is-light`]: theme.appbar === "white",
    [`is-${theme.appbar}`]: theme.appbar !== "white" && theme.appbar !== "light",
  });

  return (
    <div className={appSidebarClass}>
      <div className="nk-apps-brand">
        <Link to="/" className="logo-link">
          <img className="logo-light logo-img" src={LogoSmall} alt="logo" />
          <img className="logo-dark logo-img" src={LogoDark} alt="logo-dark" />
        </Link>
      </div>
      <div className="nk-sidebar-element">
        <div className="nk-sidebar-body">
          <SimpleBar className="nk-sidebar-content">
            <div className="nk-sidebar-menu">
              <ul className="nk-menu apps-menu">
                {dashboardLinks.map((item, index) => 
                  <React.Fragment key={index}>
                    <TooltipComponent id={"dashboard" + index} text={item.text} direction="right" />
                    <li
                      className={`nk-menu-item ${
                        location.pathname === item.link ? "active current-page" : ""
                      }`}
                      id={"dashboard" + index}
                    >
                      <Link to={`${item.link}`} className="nk-menu-link">
                        <span className="nk-menu-icon">
                          <Icon name={item.icon}></Icon>
                        </span>
                      </Link>
                    </li>
                  </React.Fragment>
                )}
                <li className="nk-menu-hr"></li>
                {applicationLinks.map((item, index) => 
                  <React.Fragment key={index}>
                    <TooltipComponent id={"app" + index} text={item.text} direction="right" />
                    <li
                      className={`nk-menu-item ${
                        location.pathname === item.link ? "active current-page" : ""
                      }`}
                      id={"app" + index}
                    >
                      <Link to={`${item.link}`} className="nk-menu-link">
                        <span className="nk-menu-icon">
                          <Icon name={item.icon}></Icon>
                        </span>
                      </Link>
                    </li>
                  </React.Fragment>
                )}
                <li className="nk-menu-hr"></li>
                <TooltipComponent id={"componentTooltip"} text="Go to component" direction="right" />
                <li
                  className={`nk-menu-item ${
                    location.pathname === "/components" ? "active current-page" : ""
                  }`}
                  id="componentTooltip"
                >
                  <Link to={`/components`} className="nk-menu-link">
                    <span className="nk-menu-icon">
                      <Icon name="layers"></Icon>
                    </span>
                  </Link>
                </li>
              </ul>
            </div>
            <div className="nk-sidebar-footer">
              <ul className="nk-menu">
                <TooltipComponent id={"settingsTooltip"} text="Settings" direction="right" />
                <li className="nk-menu-item" id="settingsTooltip">
                  <Link to={`/user-profile-setting`} className="nk-menu-link">
                    <span className="nk-menu-icon">
                      <Icon name="setting"></Icon>
                    </span>
                  </Link>
                </li>
              </ul>
            </div>
          </SimpleBar>
          <UncontrolledDropdown className="nk-sidebar-profile nk-sidebar-profile-fixed" direction="right">
            <DropdownToggle
              tag="a"
              href="#toggle"
              className="dropdown-toggle"
              onClick={(ev) => {
                ev.preventDefault();
              }}
            >
              <UserAvatar text="AB" theme="blue" />
            </DropdownToggle>
            <DropdownMenu end className="dropdown-menu-md ms-4">
              <div className="dropdown-inner user-card-wrap bg-lighter d-none d-md-block">
                <div className="user-card sm">
                  <UserAvatar text="AB" theme="blue" />
                  <div className="user-info">
                    <span className="lead-text">Abu Bin Ishtiyak</span>
                    <span className="sub-text">info@softnio.com</span>
                  </div>
                </div>
              </div>
              <div className="dropdown-inner">
                <LinkList>
                  <LinkItem link="/user-profile-regular" icon="user-alt">
                    View Profile
                  </LinkItem>
                  <LinkItem link="/user-profile-setting" icon="setting-alt">
                    Account Setting
                  </LinkItem>
                  <LinkItem link="/user-profile-activity" icon="activity-alt">
                    Login Activity
                  </LinkItem>
                </LinkList>
              </div>
              <div className="dropdown-inner">
                <LinkList>
                  <LinkItem icon="signout" link={`/auth-login`}>
                    Sign Out
                  </LinkItem>
                </LinkList>
              </div>
            </DropdownMenu>
          </UncontrolledDropdown>
        </div>
      </div>
    </div>
  );
};

export default Appbar;
