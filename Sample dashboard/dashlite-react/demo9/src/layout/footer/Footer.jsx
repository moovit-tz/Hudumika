import React from "react";
import { DropdownToggle, UncontrolledDropdown } from "reactstrap";
import { LangDropdown } from "@/components/Component";

const Footer = () => {
  return (
    <div className="nk-footer">
      <div className="container-xl wide-xl">
        <div className="nk-footer-wrap">
          <div className="nk-footer-copyright">
            {" "}
            &copy; 2025 DashLite React Template by <a href="https://softnio.com">Softnio</a>
          </div>
          <div className="nk-footer-links">
            <ul className="nav nav-sm">
              <li className="nav-item active current-page">
                <UncontrolledDropdown direction="up">
                  <DropdownToggle
                    tag="a"
                    href="#toggle"
                    onClick={(ev) => ev.preventDefault()}
                    className="dropdown-toggle dropdown-indicator has-indicator nav-link"
                  >
                    <span>English</span>
                  </DropdownToggle>
                  <LangDropdown />
                </UncontrolledDropdown>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
export default Footer;
