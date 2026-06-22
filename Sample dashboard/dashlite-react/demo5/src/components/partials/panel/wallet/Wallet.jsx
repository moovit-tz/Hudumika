import React from "react";
import { DropdownItem, DropdownMenu, DropdownToggle, UncontrolledDropdown } from "reactstrap";
import { Icon } from "@/components/Component";
import { Link } from "react-router-dom";
const Wallet = ({ icon, title, className, firstAmount, firstCurrency, secondAmount, secondCurrency }) => {
  return (
    <div className="nk-wgw">
      <div className="nk-wgw-inner">
        <Link className="nk-wgw-name" to={`/crypto/walletsbtc`}>
          <div className={["nk-wgw-icon", className ? className : null].join(" ")}>
            <Icon name={icon}></Icon>
          </div>
          <h5 className="nk-wgw-title title">{title}</h5>
        </Link>
        <div className="nk-wgw-balance">
          <div className="amount">
            {firstAmount}
            <span className="currency currency-nio">{firstCurrency}</span>
          </div>
          <div className="amount-sm">
            {secondAmount}
            <span className="currency currency-usd">{secondCurrency}</span>
          </div>
        </div>
      </div>
      <div className="nk-wgw-actions">
        <ul>
          <li>
            <Link to="#">
              <Icon name="arrow-up-right"></Icon>
              <span>Send</span>
            </Link>
          </li>
          <li>
            <Link to="#">
              <Icon name="arrow-down-left"></Icon>
              <span>Receive</span>
            </Link>
          </li>
          <li>
            <Link to="#">
              <Icon name="arrow-to-right"></Icon>
              <span>Withdraw</span>
            </Link>
          </li>
        </ul>
      </div>
      <UncontrolledDropdown className="nk-wgw-more">
        <DropdownToggle tag="a" className="btn btn-icon btn-trigger">
          <Icon name="more-h"></Icon>
        </DropdownToggle>
        <DropdownMenu className="dropdown-menu-xs" end>
          <ul className="link-list-plain sm">
            <li>
              <DropdownItem tag="a">
                <span>Details</span>
              </DropdownItem>
            </li>
            <li>
              <DropdownItem tag="a">
                <span>Edit</span>
              </DropdownItem>
            </li>
            <li>
              <DropdownItem tag="a">
                <span>Delete</span>
              </DropdownItem>
            </li>
            <li>
              <DropdownItem tag="a">
                <span>Make Default</span>
              </DropdownItem>
            </li>
          </ul>
        </DropdownMenu>
      </UncontrolledDropdown>
    </div>
  );
};

export default Wallet;
