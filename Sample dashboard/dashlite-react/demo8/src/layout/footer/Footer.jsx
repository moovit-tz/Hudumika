import React from "react";
import EnglishFlag from "@/images/flags/english.png";
import SpanishFlag from "@/images/flags/spanish.png";
import FrenchFlag from "@/images/flags/french.png";
import TurkeyFlag from "@/images/flags/turkey.png";
import { Link } from "react-router-dom";
import { DropdownItem, DropdownMenu, UncontrolledDropdown, DropdownToggle } from "reactstrap";

const Footer = () => {
  return (
    <div className="nk-footer bg-white">
      <div className="container-fluid">
        <div className="nk-footer-wrap">
          <div className="nk-footer-copyright">
            {" "}
            &copy; 2025 DashLite React Template by <a href="https://softnio.com">Softnio</a>
          </div>
          <div className="nk-footer-links">
            <ul className="nav nav-sm">
              <li className="nav-item">
                <UncontrolledDropdown direction="up">
                  <DropdownToggle
                    color="transparent"
                    className="dropdown-toggle dropdown-indicator has-indicator nav-link"
                  >
                    <span>English</span>
                  </DropdownToggle>
                  <DropdownMenu end className="dropdown-menu-sm">
                    <ul className="language-list">
                      <li>
                        <DropdownItem
                          tag="a"
                          href="#dropdownitem"
                          onClick={(ev) => {
                            ev.preventDefault();
                          }}
                          className="language-item"
                        >
                          <img src={EnglishFlag} alt="" className="language-flag" />
                          <span className="language-name">English</span>
                        </DropdownItem>
                      </li>
                      <li>
                        <DropdownItem
                          tag="a"
                          href="#dropdownitem"
                          onClick={(ev) => {
                            ev.preventDefault();
                          }}
                          className="language-item"
                        >
                          <img src={SpanishFlag} alt="" className="language-flag" />
                          <span className="language-name">Español</span>
                        </DropdownItem>
                      </li>
                      <li>
                        <DropdownItem
                          tag="a"
                          href="#dropdownitem"
                          onClick={(ev) => {
                            ev.preventDefault();
                          }}
                          className="language-item"
                        >
                          <img src={FrenchFlag} alt="" className="language-flag" />
                          <span className="language-name">Français</span>
                        </DropdownItem>
                      </li>
                      <li>
                        <DropdownItem
                          tag="a"
                          href="#dropdownitem"
                          onClick={(ev) => {
                            ev.preventDefault();
                          }}
                          className="language-item"
                        >
                          <img src={TurkeyFlag} alt="" className="language-flag" />
                          <span className="language-name">Türkçe</span>
                        </DropdownItem>
                      </li>
                    </ul>
                  </DropdownMenu>
                </UncontrolledDropdown>
              </li>
              <li className="nav-item">
                <Link to={`/pages/terms-policy`} className="nav-link">
                  Terms
                </Link>
              </li>
              <li className="nav-item">
                <Link to={`/pages/faq`} className="nav-link">
                  Privacy
                </Link>
              </li>
              <li className="nav-item">
                <Link to={`/pages/terms-policy`} className="nav-link">
                  Help
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
export default Footer;
