import React, { useState, useEffect } from "react";
import Content from "@/layout/content/Content";
import {  NavLink, Outlet } from "react-router-dom";
import { BlockDes, BlockHead, BlockHeadContent, BlockTitle, Icon, } from "@/components/Component";
import {  Nav, NavItem, Tooltip } from "reactstrap";

const UserProfileLayout = () => {
  const [tooltipOpen , setOpen] = useState(false);
  const toggle = () => {setOpen(!tooltipOpen)};

  const [sm, updateSm] = useState(false);
  const [mobileView, setMobileView] = useState(false);

  // function to change the design view under 990 px
  const viewChange = () => {
    if (window.innerWidth < 990) {
      setMobileView(true);
    } else {
      setMobileView(false);
      updateSm(false);
    }
  };

  useEffect(() => {
    viewChange();
    window.addEventListener("load", viewChange);
    window.addEventListener("resize", viewChange);
    document.getElementsByClassName("nk-header")[0].addEventListener("click", function () {
      updateSm(false);
    });
    return () => {
      window.removeEventListener("resize", viewChange);
      window.removeEventListener("load", viewChange);
    };
  }, []);

  return (
    <React.Fragment>
      <Content>
        <BlockHead>
          <BlockHeadContent>
            <div className="nk-block-head-sub"><span>Account Setting</span></div>
            <BlockTitle tag="h2" className="fw-normal">My Profile</BlockTitle>
            <BlockDes>
            <p>You have full control to manage your own account setting. <span className="text-primary">
              <Icon name="info" id="id"></Icon></span>
              </p>
              <Tooltip placement="right" isOpen={tooltipOpen} target="id" toggle={toggle}>
                Tooltip on right
              </Tooltip>
            </BlockDes>
          </BlockHeadContent>
        </BlockHead>
        <Nav 
        className={`nk-nav nav nav-tabs ${
          sm ? "content-active" : ""
        }`}>
          <NavItem className="nav-item" onClick={() => updateSm(false)}>
            <NavLink
              to={`/crypto/user-profile-regular`}
              className={
                window.location.pathname === `/crypto/user-profile-regular` ? "nav-link active" : "nav-link"
              }
            >
              <span>Personal</span>
            </NavLink>
          </NavItem>
          <NavItem className="nav-item" onClick={() => updateSm(false)}>
            <NavLink
              to={`/crypto/user-profile-setting`}
              className={
                window.location.pathname === `/crypto/user-profile-setting` ? "nav-link active" : "nav-link"
              }
            >
              <span>Security</span>
            </NavLink>
          </NavItem>
          <NavItem className="nav-item" onClick={() => updateSm(false)}>
            <NavLink
              to={`/crypto/user-profile-notification`}
              className={
                window.location.pathname === `/crypto/user-profile-notification`
                  ? "nav-link active"
                  : "nav-link"
              }
            >
              <span>Notifications</span>
            </NavLink>
          </NavItem>
          <NavItem className="nav-item" onClick={() => updateSm(false)}>
            <NavLink 
              to={`/crypto/user-profile-connected`}
              className={
                window.location.pathname === `/crypto/user-profile-connected` ? "nav-link active" : "nav-link"
              }
            >
              <span>Connect Social</span>
            </NavLink>
          </NavItem>
        </Nav>
        
        <Outlet />

      </Content>
    </React.Fragment>
  );
};

export default UserProfileLayout;
