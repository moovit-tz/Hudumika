import React, { useState } from "react";
import Icon from "@/components/icon/Icon";
import { UncontrolledDropdown, CardTitle, DropdownMenu, DropdownItem, DropdownToggle } from "reactstrap";
import { StackedBarChart } from "@/components/partials/charts/sales/Charts";

const UserActivity = () => {
  const [userActivity, setUserActivity] = useState("");
  return (
    <React.Fragment>
      <div className="card-inner">
        <div className="card-title-group align-start mb-3">
          <CardTitle className="card-title">
            <h6 className="title">User Activities</h6>
            <p>
              In last In last {userActivity === "day" ? "30 days" : userActivity === "month" ? "3 months" : "15 days"}{" "}
              <Icon name="info"></Icon>
            </p>
          </CardTitle>
          <div className="card-tools mt-n1 me-n1">
            <UncontrolledDropdown>
              <DropdownToggle tag="a" className="dropdown-toggle btn btn-icon btn-trigger">
                <Icon name="more-h"></Icon>
              </DropdownToggle>
              <DropdownMenu end>
                <ul className="link-list-opt no-bdr">
                  <li className={userActivity === "" ? "active" : ""}>
                    <DropdownItem
                      href="#dropdownitem"
                      onClick={(ev) => {
                        ev.preventDefault();
                        setUserActivity("");
                      }}
                    >
                      <span>15 Days</span>
                    </DropdownItem>
                  </li>
                  <li className={userActivity === "day" ? "active" : ""}>
                    <DropdownItem
                      href="#dropdownitem"
                      onClick={(ev) => {
                        ev.preventDefault();
                        setUserActivity("day");
                      }}
                    >
                      <span>30 Days</span>
                    </DropdownItem>
                  </li>
                  <li className={userActivity === "month" ? "active" : ""}>
                    <DropdownItem
                      href="#dropdownitem"
                      onClick={(ev) => {
                        ev.preventDefault();
                        setUserActivity("month");
                      }}
                    >
                      <span>3 Months</span>
                    </DropdownItem>
                  </li>
                </ul>
              </DropdownMenu>
            </UncontrolledDropdown>
          </div>
        </div>
        <div className="user-activity-group g-4">
          <div className="user-activity">
            <Icon name="users"></Icon>
            <div className="info">
              <span className="amount">
                {" "}
                {userActivity === "day" ? "345" : userActivity === "month" ? "850" : "50"}
              </span>
              <span className="title">Direct Join</span>
            </div>
          </div>
          <div className="user-activity">
            <Icon name="users"></Icon>
            <div className="info">
              <span className="amount"> {userActivity === "day" ? "49" : userActivity === "month" ? "250" : "10"}</span>
              <span className="title">Referral Join</span>
            </div>
          </div>
        </div>
      </div>
      <div className="user-activity-ck">
        <StackedBarChart state={userActivity} />
      </div>
    </React.Fragment>
  );
};
export default UserActivity;
