import React, { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { Icon, UserAvatar } from "@/components/Component";
import { findUpper } from "@/utils/Utils";
import {  DropdownItem, UncontrolledDropdown, DropdownMenu, DropdownToggle } from "reactstrap";

const UserProfileAside = ({updateSm,sm}) => {
  const [profileName, setProfileName] = useState("Abu Bin Ishtiak");
  
  useEffect(() => {
    sm ? document.body.classList.add("toggle-shown") : document.body.classList.remove("toggle-shown");
  }, [sm])
  
  return (
    <div className="card-inner-group">
    <div className="card-inner">
        <div className="user-card">
        <UserAvatar text={findUpper(profileName)} theme="primary" />
        <div className="user-info">
            <span className="lead-text">{profileName}</span>
            <span className="sub-text">info@softnio.com</span>
        </div>
        <div className="user-action">
            <UncontrolledDropdown>
            <DropdownToggle tag="a" className="btn btn-icon btn-trigger me-n2">
                <Icon name="more-v"></Icon>
            </DropdownToggle>
            <DropdownMenu end>
                <ul className="link-list-opt no-bdr">
                <li>
                    <DropdownItem
                    tag="a"
                    href="#dropdownitem"
                    onClick={(ev) => {
                        ev.preventDefault();
                    }}
                    >
                    <Icon name="camera-fill"></Icon>
                    <span>Change Photo</span>
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
                    <Icon name="edit-fill"></Icon>
                    <span>Update Profile</span>
                    </DropdownItem>
                </li>
                </ul>
            </DropdownMenu>
            </UncontrolledDropdown>
        </div>
        </div>
    </div>
    <div className="card-inner">
        <div className="user-account-info py-0">
        <h6 className="overline-title-alt">Nio Wallet Account</h6>
        <div className="user-balance">
            12.395769 <small className="currency currency-btc">BTC</small>
        </div>
        <div className="user-balance-sub">
            Locked{" "}
            <span>
            0.344939 <span className="currency currency-btc">BTC</span>
            </span>
        </div>
        </div>
    </div>
    <div className="card-inner p-0">
        <ul className="link-list-menu">
        <li onClick={() => updateSm(false)}>
            <NavLink
            to={`/user-profile-regular`}
            >
            <Icon name="user-fill-c"></Icon>
            <span>Personal Information</span>
            </NavLink>
        </li>
        <li onClick={() => updateSm(false)}>
            <NavLink
            to={`/user-profile-notification`}
            >
            <Icon name="bell-fill"></Icon>
            <span>Notification</span>
            </NavLink>
        </li>
        <li onClick={() => updateSm(false)}>
            <NavLink
            to={`/user-profile-activity`}
            >
            <Icon name="activity-round-fill"></Icon>
            <span>Account Activity</span>
            </NavLink>
        </li>
        <li onClick={() => updateSm(false)}>
            <NavLink
            to={`/user-profile-setting`}
            >
            <Icon name="lock-alt-fill"></Icon>
            <span>Security Setting</span>
            </NavLink>
        </li>
        </ul>
    </div>
    </div>
  );
};

export default UserProfileAside;
