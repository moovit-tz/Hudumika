import React, { useState } from "react";
import Content from "@/layout/content/Content";
import Profile from "./Profile";
import ProfileNotify from "./ProfileNotify";
import ProfileSetting from "./ProfileSetting";
import ProfileConnected from "./ProfileConnected";
import { Route, Link, Outlet } from "react-router-dom";
import {
  Block,
  BlockDes,
  BlockHead,
  BlockHeadSub,
  BlockHeadContent,
  BlockTitle,
  BackTo,
  Icon,
} from "@/components/Component";

const ProfileLayout = () => {
  const [page, setPage] = useState("Profile");

  return (
    <React.Fragment>
      <Content size="lg">
        <BlockHead>
          <BlockHeadContent>
            {page === "profile" || window.location.pathname === "/invest/profile" ? (
              <BlockHeadSub>My Profile</BlockHeadSub>
            ) : (
              <BackTo icon="arrow-left" link="/invest/profile" onClick={() => setPage("Profile")}>
                {" "}
                My Profile{" "}
              </BackTo>
            )}
            <BlockTitle tag="h2" className="fw-normal">
              {page === "Social" ? "Social Connect" : `Account ${page}`}
            </BlockTitle>
            <BlockDes>
              <p>
                You have full control to manage your own account setting.{" "}
                <span className="text-primary">
                  <Icon name="info"></Icon>
                </span>
              </p>
            </BlockDes>{" "}
          </BlockHeadContent>
        </BlockHead>

        <ul className="nav nk-nav nav-tabs">
          <li
            className={`nav-item ${
              window.location.pathname === `/invest/profile` ? "active current-page" : ""
            } `}
          >
            <Link
              to={`/invest/profile`}
              className={`nav-link
                    ${window.location.pathname === `/invest/profile` ? "active" : ""}
                  `}
              onClick={() => setPage("Profile")}
            >
              <span>Personal</span>
            </Link>
          </li>
          <li
            className={`nav-item ${
              window.location.pathname === `/invest/profile-setting` ? "active" : ""
            }`}
          >
            <Link
              to={`/invest/profile-setting`}
              className={`nav-link ${
                window.location.pathname === `/invest/profile-setting` ? "active" : ""
              }`}
              onClick={() => setPage("Setting")}
            >
              <span>Security</span>
            </Link>
          </li>
          <li
            className={`nav-item ${
              window.location.pathname === `/invest/profile-notify` ? "active" : ""
            }`}
          >
            <Link
              to={`/invest/profile-notify`}
              className={`nav-link ${
                window.location.pathname === `/invest/profile-notify` ? "active" : ""
              }`}
              onClick={() => setPage("Notification")}
            >
              <span>Notification</span>
            </Link>
          </li>
          <li
            className={`nav-item ${
              window.location.pathname === `/invest/profile-connected` ? "active" : ""
            }`}
          >
            <Link
              to={`/invest/profile-connected`}
              className={`nav-link ${
                window.location.pathname === `/invest/profile-connected` ? "active" : ""
              }`}
              onClick={() => setPage("Social")}
            >
              <span> Connect Social </span>
            </Link>
          </li>
        </ul>

        <Block>
          <Outlet />
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default ProfileLayout;
