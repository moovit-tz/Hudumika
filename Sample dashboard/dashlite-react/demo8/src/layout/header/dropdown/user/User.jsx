import React, { useState } from "react";
import UserAvatar from "@/components/user/UserAvatar";
import { DropdownToggle, DropdownMenu, Dropdown } from "reactstrap";
import { Icon } from "@/components/Component";
import { LinkList, LinkItem } from "@/components/links/Links";
import { Link } from "react-router-dom";
import { useTheme, useThemeUpdate } from "@/layout/provider/Theme";

const User = () => {
  const theme = useTheme();
  const themeUpdate = useThemeUpdate();
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((prevState) => !prevState);

  return (
    <Dropdown isOpen={open} className="user-dropdown" toggle={toggle}>
      <DropdownToggle
        tag="a"
        href="#toggle"
        className="dropdown-toggle"
        onClick={(ev) => {
          ev.preventDefault();
        }}
      >
        <div className="user-toggle">
          <UserAvatar icon="user-alt" className="sm" />
        </div>
      </DropdownToggle>
      <DropdownMenu end className="dropdown-menu-md dropdown-menu-s1">
        <div className="dropdown-inner user-card-wrap bg-lighter d-none d-md-block">
          <div className="user-card sm">
            <div className="user-avatar">
              <span>AB</span>
            </div>
            <div className="user-info">
              <span className="lead-text">Abu Bin Ishtiyak</span>
              <span className="sub-text">info@softnio.com</span>
            </div>
            <div className="user-action" onClick={() => setOpen(false)}>
              <Link to={`/user-profile-setting`} className="btn btn-icon me-n2">
                <Icon name="setting"></Icon>
              </Link>
            </div>
          </div>
        </div>
        <div className="dropdown-inner user-account-info">
          <h6 className="overline-title-alt">Account Balance</h6>
          <div className="user-balance">
            1,494.23 <small className="currency currency-usd">USD</small>
          </div>
          <div className="user-balance-sub">
            Locked{" "}
            <span>
              15,495.39 <span className="currency currency-usd">USD</span>
            </span>
          </div>
          <a href="#checkout" onClick={(ev) => ev.preventDefault()} className="link">
            <span>Withdraw Balance</span> <Icon name="wallet-out"></Icon>
          </a>
        </div>
        <div className="dropdown-inner">
          <LinkList>
            <LinkItem link={"/user-profile-regular"} icon="user-alt" onClick={toggle}>
              View Profile
            </LinkItem>
            <LinkItem link={"/user-profile-setting"} icon="setting-alt" onClick={toggle}>
              Account Setting
            </LinkItem>
            <LinkItem link={"/user-profile-activity"} icon="activity-alt" onClick={toggle}>
              Login Activity
            </LinkItem>
            <li>
              <a className={`dark-switch ${theme.skin === 'dark' ? 'active' : ''}`} href="#" 
              onClick={(ev) => {
                ev.preventDefault();
                themeUpdate.skin(theme.skin === 'dark' ? 'light' : 'dark');
              }}>
                {theme.skin === 'dark' ? 
                  <><em className="icon ni ni-sun"></em><span>Light Mode</span></> 
                  : 
                  <><em className="icon ni ni-moon"></em><span>Dark Mode</span></>
                }
              </a>
            </li>
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
    </Dropdown>
  );
};

export default User;
