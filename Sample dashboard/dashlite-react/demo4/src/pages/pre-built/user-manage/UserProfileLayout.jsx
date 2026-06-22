import React from "react";
import Content from "@/layout/content/Content";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Block, BlockDes, BlockHead, BlockHeadContent, BlockTitle, Icon } from "@/components/Component";
import { Card } from "reactstrap";

const UserProfileLayout = () => {
  const location = useLocation();
  return (
    <React.Fragment>
      <Content>
        <BlockHead>
          <BlockHeadContent>
            <BlockTitle>My Profile</BlockTitle>
            <BlockDes>You have full control to manage your own account setting.</BlockDes>
          </BlockHeadContent>
        </BlockHead>
        <Block>
          <Card className="card-bordered">
            <ul className="nav nav-tabs nav-tabs-mb-icon nav-tabs-card">
              <li
                className={`nav-item ${
                  location.pathname === `/user-profile-regular`
                    ? "active current-page"
                    : ""
                } `}
              >
                <Link
                  to={`/user-profile-regular`}
                  className={`nav-link
                    ${location.pathname === `/user-profile-regular` ? "active" : ""}
                  `}
                >
                  <Icon name="user-fill-c"></Icon>
                  <span>Personal</span>
                </Link>
              </li>
              <li
                className={`nav-item ${
                  location.pathname === `/user-profile-notification` ? "active" : ""
                }`}
              >
                <Link
                  to={`/user-profile-notification`}
                  className={`nav-link ${
                    location.pathname === `/user-profile-notification` ? "active" : ""
                  }`}
                >
                  <Icon name="bell-fill"></Icon>
                  <span>Notification</span>
                </Link>
              </li>
              <li
                className={`nav-item ${
                  location.pathname === `/user-profile-activity` ? "active" : ""
                }`}
              >
                <Link
                  to={`/user-profile-activity`}
                  className={`nav-link ${
                    location.pathname === `/user-profile-activity` ? "active" : ""
                  }`}
                >
                  <Icon name="activity-round-fill"></Icon>
                  <span>Account Activity</span>
                </Link>
              </li>
              <li
                className={`nav-item ${
                  location.pathname === `/user-profile-setting` ? "active" : ""
                }`}
              >
                <Link
                  to={`/user-profile-setting`}
                  className={`nav-link ${
                    location.pathname === `/user-profile-setting` ? "active" : ""
                  }`}
                >
                  <Icon name="lock-alt-fill"></Icon>
                  <span>Security Setting</span>
                </Link>
              </li>
            </ul>

            <div className="card-inner card-inner-lg">
              <Outlet />
            </div>
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default UserProfileLayout;
