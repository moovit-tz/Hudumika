import React, { useState } from "react";
import SimpleBar from "simplebar-react";
import InboxForm from "./InboxForm";
import { Icon, Button, UserAvatar, LinkList, LinkItem } from "@/components/Component";
import { findUpper } from "@/utils/Utils";
import { colourOptions } from "./InboxData";
import {
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
  UncontrolledDropdown,
  Badge,
  Modal,
  ModalBody
} from "reactstrap";
import LabelFormModal from "./LabelFormModal";
import ContactsFormModal from "./ContactsFormModal";

const InboxAside = ({
  navData,
  currentTab,
  aside,
  setAside,
  setCurrentTab,
  data,
  setData,
  contact,
  setContact,
  labels,
  setLabels,
  setFilterLabel,
  setMessageView,
}) => {
  const [composeModal, setComposeModal] = useState(false);
  const [contactModal, setContactModal] = useState(false);
  const [contactListModal, setContactListModal] = useState(false);
  const [composeMail, setComposeMail] = useState("");

  const [labelModal, setLabelModal] = useState({
    edit: false,
    add: false,
  });
  const [labelFormData, setLabelFormData] = useState({
    label: "",
    theme: {
      value: "primary",
      label: "Primary"
    },
  });

  const [editLabelFormData, setEditLabelFormData] = useState({
    editId:0,
    label: "",
    theme: {
      value: "primary",
      label: "Primary"
    },
  });

  const resetLabelForm = () => {
    setLabelFormData({
      label: "",
      theme: {
        value: "primary",
        label: "Primary"
      },
    });
  };

  const resetEditLabelForm = () => {
    setEditLabelFormData({
      editId:0,
      label: "",
      theme: {
        value: "primary",
        label: "Primary"
      },
    });
  };

  const onLabelFormCancel = () => {
    setLabelModal({
      edit: false,
      add: false,
    });
    resetLabelForm();
  };

  const getTabDataNum = (tab) => {
    if (tab !== "All Mails" && tab !== "Trash" && tab !== "Archive" && tab !== "Draft") {
      let defaultData = data.filter(
        (item) =>
          item.message.meta[tab.toLowerCase()] === true &&
          item.message.meta.trash !== true &&
          item.message.meta.archive !== true &&
          item.message.meta.unread !== true
      );
      return defaultData.length;
    } else if (tab === "Draft") {
      let defaultData = data.filter(
        (item) =>
          item.message.meta.draft === true && item.message.meta.trash !== true && item.message.meta.archive !== true
      );
      return defaultData.length;
    } else if (tab === "Archive") {
      let defaultData = data.filter((item) => item.message.meta.archive === true);
      return defaultData.length;
    } else if (tab === "Trash") {
      let defaultData = data.filter((item) => item.message.meta.trash === true);
      return defaultData.length;
    } else {
      return data.length;
    }
  };

  const onLabelFormSubmit = (form) => {
    const { label, theme } = form;
    let dataObject = {
      id: Math.floor(Math.random() * 4000) + labels.length + 1,
      text: label,
      color: theme.value,
    };
    setLabels([dataObject, ...labels]);
    setLabelModal({
      edit: false,
      add: false,
    });
    resetLabelForm();
  };

  const onLabelEditClick = (id) => {
    labels.forEach((item) => {
      if (item.id === id) {
        const selected_theme = colourOptions.filter(function (option) {
          return option.value === item.color;
        });
        setLabelModal({...labelModal, edit:true});
        setEditLabelFormData({
          label: item.text, 
          theme: {
            value: selected_theme[0].value,
            label: selected_theme[0].label
          }, 
          editId: item.id
        })
      }
    });
  };

  const onLabelEditFormSubmit = (form) => {
    const { label, theme } = form;
    let dataObject = {
      id: editLabelFormData.editId,
      text: label,
      color: theme.value,
    };
    let defaultData = labels;
    let foundData = defaultData.findIndex((item) => item.id === editLabelFormData.editId);
    defaultData[foundData] = dataObject;
    setLabels([...defaultData]);
    resetEditLabelForm();
    setLabelModal({
      edit: false,
    });
  };

  const [conatctFormData, setConatctFormData] = useState({
    name: "",
    theme: "primary",
    designation: "",
    mail: "",
  });

  const resetConatctForm = () => {
    setConatctFormData({
      name: "",
      theme: "primary",
      designation: "",
      mail: "",
    });
  };

  const onConatctFormCancel = () => {
    setContactModal(false);
    resetConatctForm();
  };

  const onContactFormSubmit = (data) => {
    let dataObject = {
      id: Math.floor(Math.random() * 4000) + contact.length + 1,
      name: data.name,
      theme: "primary",
      designation: data.designation,
      mail: data.mail,
    };
    setContact([dataObject, ...contact]);
    setContactModal(false);
  };

  const deleteLabel = (id) => {
    let defaultVal = labels.filter((item) => item.id !== id);
    setLabels(defaultVal);
  };

  return (
    <div className={`nk-ibx-aside toggle-screen-lg ${aside ? "content-active" : ""}`}>
      <div className="nk-ibx-head">
        <Button
          onClick={(ev) => {
            ev.preventDefault();
            setComposeMail("");
            setComposeModal(true);
          }}
          className="btn-primary btn-block"
        >
          <Icon name="plus"></Icon> <span>Compose</span>{" "}
        </Button>
      </div>
      <SimpleBar className="nk-ibx-nav">
        <React.Fragment>
          <ul className="nk-ibx-menu">
            {navData.map((item) => (
              <li className={currentTab === item.name ? "active" : ""} key={item.name}>
                <a
                  className="nk-ibx-menu-item"
                  href="#menu-item"
                  onClick={(ev) => {
                    ev.preventDefault();
                    setCurrentTab(item.name);
                    setAside(false);
                    setMessageView(false);
                  }}
                >
                  <Icon name={item.icon}></Icon>
                  <span className="nk-ibx-menu-text">{item.name}</span>
                  {item.badge && (
                    <Badge pill color={item.badge.theme}>{getTabDataNum(item.name)}</Badge>
                  )}
                </a>
              </li>
            ))}
          </ul>
          <div className="nk-ibx-nav-head">
            <h6 className="title">Label</h6>
            <a
              className="link"
              href="#add"
              onClick={(ev) => {
                ev.preventDefault();
                setLabelModal({...labelModal, add:true});
              }}
            >
              <Icon name="plus-c"></Icon>
            </a>
          </div>
          <ul className="nk-ibx-label">
            {labels.map((item) => (
              <li key={item.id}>
                <a
                  href="#select"
                  onClick={(ev) => {
                    ev.preventDefault();
                    setFilterLabel(item.text);
                  }}
                >
                  <span className={`nk-ibx-label-dot dot dot-xl dot-label bg-${item.color}`}></span>
                  <span className="nk-ibx-label-text">{item.text}</span>
                </a>
                <UncontrolledDropdown>
                  <DropdownToggle
                    tag="a"
                    href="#item"
                    onClick={(ev) => ev.preventDefault()}
                    className="dropdown-toggle"
                  >
                    <Icon name="more-v"></Icon>
                  </DropdownToggle>
                  <DropdownMenu end className="dropdown-menu-sm">
                    <ul className="link-list-opt no-bdr">
                      <li>
                        <DropdownItem
                          tag="a"
                          href="#item"
                          onClick={(ev) => {
                            ev.preventDefault();
                            onLabelEditClick(item.id);
                          }}
                        >
                          <span>Edit Label</span>
                        </DropdownItem>
                      </li>
                      <li>
                        <DropdownItem
                          tag="a"
                          href="#item"
                          onClick={(ev) => {
                            ev.preventDefault();
                            deleteLabel(item.id);
                          }}
                        >
                          <span>Remove Label</span>
                        </DropdownItem>
                      </li>
                      <li className="divider"></li>
                    </ul>
                    <ul className="link-check">
                      <li>
                        <DropdownItem tag="a" href="#item" onClick={(ev) => ev.preventDefault()}>
                          Show if unread
                        </DropdownItem>
                      </li>
                      <li className="active">
                        <DropdownItem tag="a" href="#item" onClick={(ev) => ev.preventDefault()}>
                          Show
                        </DropdownItem>
                      </li>
                      <li>
                        <DropdownItem tag="a" href="#item" onClick={(ev) => ev.preventDefault()}>
                          Hide
                        </DropdownItem>
                      </li>
                    </ul>
                  </DropdownMenu>
                </UncontrolledDropdown>
              </li>
            ))}
          </ul>
          <div className="nk-ibx-nav-head mb-4">
            <a
              className="link link-primary"
              href="#add"
              onClick={(ev) => {
                ev.preventDefault();
                setContactListModal(true);
              }}
            >
              <span>Contact List</span>
              <Icon name="arrow-right"></Icon>
            </a>
          </div>
          <div className="nk-ibx-status">
            <div className="nk-ibx-status-info">
              <Icon name="hard-drive"></Icon>
              <span>
                <strong>6 GB</strong> (5%) of 100GB used
              </span>
            </div>
            <div className="progress progress-md bg-light">
              <div className="progress-bar" style={{ width: "5%" }}></div>
            </div>
          </div>
        </React.Fragment>
      </SimpleBar>
      <InboxForm
        mailData={data}
        setMailData={setData}
        toggleModal={setComposeModal}
        composeMail={composeMail}
        composeState={composeModal}
        draftData={{ subject: "", message: "" }}
      />
      <LabelFormModal modal={labelModal.add} modalAction="add" formData={labelFormData} setFormData={setLabelFormData} closeModal={onLabelFormCancel} onSubmit={onLabelFormSubmit} />
      <LabelFormModal modal={labelModal.edit} modalAction="edit" formData={editLabelFormData} setFormData={setEditLabelFormData} closeModal={onLabelFormCancel} onSubmit={onLabelEditFormSubmit} />
      <ContactsFormModal modal={contactModal} formData={conatctFormData} setFormData={setConatctFormData} closeModal={onConatctFormCancel} onSubmit={onContactFormSubmit} />
      <Modal size="sm" isOpen={contactListModal} toggle={() => setContactListModal(false)}>
        <ModalBody>
          <a
            href="#cancel"
            onClick={(ev) => {
              ev.preventDefault();
              setContactListModal(false);
            }}
            className="close"
          >
            <Icon name="cross-sm"></Icon>
          </a>
          <div>
            <h5 className="title">Contact List</h5>
            <div className="mt-4">
              <ul className="nk-ibx-contact">
                {contact.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <a href="#item" onClick={(ev) => ev.preventDefault()}>
                      <div className="user-card">
                        <UserAvatar text={findUpper(item.name)} theme={item.theme} image={item.img}></UserAvatar>
                        <div className="user-info">
                          <span className="lead-text">{item.name}</span>
                          <span className="sub-text">{item.designation ? item.designation : item.mail}</span>
                        </div>
                      </div>
                    </a>
                    <UncontrolledDropdown>
                      <DropdownToggle
                        tag="a"
                        href="#item"
                        onClick={(ev) => ev.preventDefault()}
                        className="dropdown-toggle"
                      >
                        <Icon name="more-v"></Icon>
                      </DropdownToggle>
                      <DropdownMenu end className="dropdown-menu-xs">
                        <LinkList opt className="link-list-opt no-bdr">
                          <LinkItem link={"/user-details-regular/1"}>View Profile</LinkItem>
                          <li>
                            <DropdownItem
                              tag="a"
                              href="#item"
                              onClick={(ev) => {
                                ev.preventDefault();
                                setComposeMail(item.mail);
                                setContactListModal(false);
                                setComposeModal(true);
                              }}
                            >
                              <span>Send Email</span>
                            </DropdownItem>
                          </li>
                          <LinkItem link={"/app-chat"}>Start Chat</LinkItem>
                        </LinkList>
                      </DropdownMenu>
                    </UncontrolledDropdown>
                  </li>
                ))}
              </ul>
              <div className="d-flex justify-between m-1">
                <Button
                  color="primary"
                  size="sm"
                  onClick={() => {
                    setContactListModal(false);
                    setContactModal(true);
                  }}
                >
                  Add User
                </Button>
                <Button
                  color="light"
                  size="sm"
                  onClick={() => {
                    setContactListModal(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </ModalBody>
      </Modal>
    </div>
  );
};

export default InboxAside;
