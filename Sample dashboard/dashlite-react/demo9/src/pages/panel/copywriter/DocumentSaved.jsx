import React, { useEffect, useState } from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockHead, BlockHeadContent, BlockTitle, BlockDes, Col, Row, Icon, Button,
  PaginationComponent,
  DataTable,
  DataTableBody,
  DataTableHead,
  DataTableRow,
  DataTableItem } from "@/components/Component";
import { Link } from "react-router-dom";
import { 
  DropdownMenu,
  DropdownToggle,
  UncontrolledDropdown,
  DropdownItem, Badge, Nav, NavItem, NavLink, TabContent, TabPane } from "reactstrap";
import classnames from "classnames";
import { documents } from "./data/document";

import noDocuments from "@/images/copywriter/illustrations/no-documents.svg";

const DocumentSaved = () => {
  const urlParams = new URLSearchParams(window.location.search);
  let tabValue = urlParams.get('tab') === null ? "recent" : urlParams.get('tab').toString();

  const [activeTab, setActiveTab] = useState(tabValue);

  useEffect(() => {
    setActiveTab(tabValue);
  }, [tabValue]);

  const toggleTab = (tab) => {
    if (activeTab !== tab) setActiveTab(tab);
  }
  const [data, setData] = useState(documents);

  const [tablesm, updateTableSm] = useState(false);
  const [onSearch, setonSearch] = useState(true);
  const [onSearchText, setSearchText] = useState("");

  const [actionText, setActionText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemPerPage, setItemPerPage] = useState(10);
  const [sort, setSortState] = useState("");


  // Sorting data
  const sortFunc = (params) => {
    let defaultData = data;
    if (params === "asc") {
      let sortedData = defaultData.sort((a, b) => a.name.localeCompare(b.name));
      setData([...sortedData]);
    } else if (params === "dsc") {
      let sortedData = defaultData.sort((a, b) => b.name.localeCompare(a.name));
      setData([...sortedData]);
    }
  };

  // unselects the data on mount
  useEffect(() => {
    let newData;
    newData = documents.map((item) => {
      item.checked = false;
      return item;
    });
    setData([...newData]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Changing state value when searching name
  useEffect(() => {
    if (onSearchText !== "") {
      const filteredObject = documents.filter((item) => {
        return (
          item.name.toLowerCase().includes(onSearchText.toLowerCase()) ||
          item.type.toLowerCase().includes(onSearchText.toLowerCase())
        );
      });
      setData([...filteredObject]);
    } else {
      setData([...documents]);
    }
  }, [onSearchText, setData]);

  // function to set the action to be taken in table header
  const onActionText = (e) => {
    setActionText(e.value);
  };

  // onChange function for searching name
  const onFilterChange = (e) => {
    setSearchText(e.target.value);
  };


  // function to toggle the search option
  const toggle = () => setonSearch(!onSearch);

  // Get current list, pagination
  const indexOfLastItem = currentPage * itemPerPage;
  const indexOfFirstItem = indexOfLastItem - itemPerPage;
  const currentItems = data.slice(indexOfFirstItem, indexOfLastItem);

  // Change Page
  const paginate = (pageNumber) => setCurrentPage(pageNumber);


  return (
    <React.Fragment>
      <Head title="Document Saved"></Head>
      <Content>
        <BlockHead size="lg">
          <div className="nk-block-head-sub"><span></span></div>
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle className="page-title">Document Saved</BlockTitle>
              <BlockDes>
                <p>List of documents you saved for later.</p>
              </BlockDes>
            </BlockHeadContent>
            <BlockHeadContent>
              <a href="#" className="btn btn-primary d-none d-sm-inline-flex"><em className="icon ni ni-plus"></em><span>Create New</span></a>
              <a href="#" className="btn btn-icon btn-primary d-inline-flex d-sm-none"><em className="icon ni ni-plus"></em></a>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>
        <Block>
        <DataTable className="card-stretch">
            <div className="card-inner position-relative card-tools-toggle">
              <div className="card-title-group">
                <Nav tabs className="nav-tabs-s2">
                  <NavItem>
                    <NavLink tag="a"
                    href="#tab"
                    className={classnames([{"py-1": true},{ active: activeTab === "recent" }])}
                    onClick={(ev) => {
                      ev.preventDefault();
                      toggleTab("recent");
                    }}>Recent</NavLink>
                  </NavItem>
                  <NavItem>
                    <NavLink tag="a"
                    href="#tab"
                    className={classnames([{"py-1": true},{ active: activeTab === "trash" }])}
                    onClick={(ev) => {
                      ev.preventDefault();
                      toggleTab("trash");
                    }}>Trash</NavLink>
                  </NavItem>
                </Nav>
                <div className="card-tools me-n1">
                  <ul className="btn-toolbar gx-1">
                    <li>
                      <a
                        href="#search"
                        onClick={(ev) => {
                          ev.preventDefault();
                          toggle();
                        }}
                        className="btn btn-icon search-toggle toggle-search"
                      >
                        <Icon name="search"></Icon>
                      </a>
                    </li>
                    <li className="btn-toolbar-sep"></li>
                    <li>
                      <UncontrolledDropdown>
                        <DropdownToggle tag="a" className="btn btn-trigger btn-icon dropdown-toggle">
                          <div className="dot dot-primary"></div>
                          <Icon name="filter-alt"></Icon>
                        </DropdownToggle>
                        <DropdownMenu
                          end
                          style={{ overflow: "visible" }}
                        >
                          <div className="dropdown-content">
                              <ul className="link-check">
                                  <li>
                                      <DropdownItem tag="a" href="#links"><Icon name="calendar-check"></Icon><span>Date Created</span></DropdownItem>
                                  </li>
                                  <li className="active">
                                      <DropdownItem tag="a" href="#links"><Icon name="edit"></Icon><span>Last Modified</span></DropdownItem>
                                  </li>
                                  <li>
                                      <DropdownItem tag="a" href="#links"><Icon name="text-a"></Icon><span>Alphabetical</span></DropdownItem>
                                  </li>
                              </ul>
                          </div>
                        </DropdownMenu>
                      </UncontrolledDropdown>
                    </li>
                  </ul>
                </div>
              </div>
              <div className={`card-search search-wrap ${!onSearch && "active"}`}>
                <div className="card-body">
                  <div className="search-content">
                    <Button
                      className="search-back btn-icon toggle-search active"
                      onClick={() => {
                        setSearchText("");
                        toggle();
                      }}
                    >
                      <Icon name="arrow-left"></Icon>
                    </Button>
                    <input
                      type="text"
                      className="border-transparent form-focus-none form-control"
                      placeholder="Search by user or email"
                      value={onSearchText}
                      onChange={(e) => onFilterChange(e)}
                    />
                    <Button className="search-submit btn-icon">
                      <Icon name="search"></Icon>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            <TabContent activeTab={activeTab}>
                <TabPane tabId="recent">
                  <DataTableBody>
                    <DataTableHead>
                      <DataTableRow>
                        <h6 className="overline-title">Name</h6>
                      </DataTableRow>
                      <DataTableRow size="sm">
                        <h6 className="overline-title">Type</h6>
                      </DataTableRow>
                      <DataTableRow size="md">
                        <h6 className="overline-title">Last Modified</h6>
                      </DataTableRow>
                      <DataTableRow></DataTableRow>
                    </DataTableHead>
                    {/*Head*/}
                    {currentItems.length > 0
                      ? currentItems.map((item) => {
                          return (
                            <DataTableItem key={item.id}>
                              <DataTableRow>
                                <div className="caption-text">{item.name}</div>
                              </DataTableRow>
                              <DataTableRow size="sm">
                                <Badge color={item.tagcolor} className="badge-dim rounded-pill">{item.type}</Badge>
                              </DataTableRow>
                              <DataTableRow size="md">
                                <div className="sub-text d-inline-flex flex-wrap gx-2">{item.lastmodified}</div>
                              </DataTableRow>
                              <DataTableRow className="nk-tb-col-tools">
                                <ul className="nk-tb-actions gx-1">
                                  <li>
                                    <UncontrolledDropdown>
                                      <DropdownToggle tag="a" className="dropdown-toggle btn btn-icon btn-trigger">
                                        <Icon name="more-h"></Icon>
                                      </DropdownToggle>
                                      <DropdownMenu end>
                                        <ul className="link-list-opt no-bdr">
                                          <li>
                                            <DropdownItem
                                              tag="a"
                                              href="#eye"
                                              onClick={(ev) => {
                                                ev.preventDefault();
                                              }}
                                            >
                                              <Icon name="eye"></Icon>
                                              <span>View Document</span>
                                            </DropdownItem>
                                          </li>
                                          <li>
                                            <DropdownItem
                                              tag="a"
                                              href="#edit"
                                              onClick={(ev) => {
                                                ev.preventDefault();
                                              }}
                                            >
                                              <Icon name="edit"></Icon>
                                              <span>Rename</span>
                                            </DropdownItem>
                                          </li>
                                          <li>
                                            <DropdownItem
                                              tag="a"
                                              href="#trash"
                                              onClick={(ev) => {
                                                ev.preventDefault();
                                              }}
                                            >
                                              <Icon name="trash"></Icon>
                                              <span>Move to Trash</span>
                                            </DropdownItem>
                                          </li>
                                        </ul>
                                      </DropdownMenu>
                                    </UncontrolledDropdown>
                                  </li>
                                </ul>
                              </DataTableRow>
                            </DataTableItem>
                          );
                        })
                      : null}
                  </DataTableBody>
                </TabPane>
                <TabPane tabId="trash">
                  <Row className="justify-content-center py-5">
                      <Col md="7" lg="4">
                          <div className="mb-3 text-center">
                              <img src={noDocuments} alt="" />
                          </div>
                          <div className="nk-block-head text-center">
                              <div className="nk-block-head-content">
                                  <h3 className="nk-block-title mb-2">No documents in trash.</h3>
                                  <p>All files have been permanently removed from the trash folder and cannot be retrieved.</p>
                              </div>
                          </div>
                          <div className="text-center">
                              <Link className="btn btn-primary" to={`/copywriter/templates`}>Explore Templates</Link>
                          </div>
                      </Col>
                  </Row>
                </TabPane>
            </TabContent>
            <div className="card-inner border-top">
              {currentItems.length > 0 ? (
                <PaginationComponent
                  itemPerPage={itemPerPage}
                  totalItems={data.length}
                  paginate={paginate}
                  currentPage={currentPage}
                />
              ) : (
                <div className="text-center">
                  <span className="text-silent">No data found</span>
                </div>
              )}
            </div>
          </DataTable>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default DocumentSaved;
