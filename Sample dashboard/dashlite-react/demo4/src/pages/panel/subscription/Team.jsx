import React from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockDes, BlockHead, BlockHeadContent, BlockTitle, Icon, RSelect } from "@/components/Component";
import { Card, UncontrolledDropdown, DropdownToggle, DropdownMenu } from "reactstrap";
import teamData from "./data/team";
import { findUpper } from "@/utils/Utils";

export const teamRole = [
  { value: "Member", label: "Member" },
  { value: "Subscriber", label: "Subscriber" },
  { value: "Admin", label: "Admin" },
  { value: "Super Admin", label: "Super Admin" },
];

const Team = () => {
  return (
    <React.Fragment>
      <Head title="Team"></Head>
      <Content>
        <BlockHead size="lg">
            <div className="nk-block-head-sub"><span>Team Members</span></div>
            <BlockBetween className="g-4" size="md">
                <BlockHeadContent>
                  <BlockTitle tag="h2" className="fw-normal">Team Manage</BlockTitle>
                  <BlockDes>
                    <p>You can add and  remove team member as you want.</p>
                  </BlockDes>
                </BlockHeadContent>
                <BlockHeadContent>
                    <ul className="nk-block-tools gx-3">
                      <li><a href="#" className="btn btn-primary">Invite New Member</a></li>
                    </ul>
                </BlockHeadContent>
            </BlockBetween>
        </BlockHead>
        <Block>
          <Card className="card-bordered">
            <table className="table table-member">
                <thead className="tb-member-head table-light">
                    <tr className="tb-member-item">
                        <th className="tb-member-info">
                            <span className="overline-title">Team Member</span>
                        </th>
                        <th className="tb-member-type tb-col-sm">
                            <span className="overline-title">Permission</span>
                        </th>
                        <th className="tb-member-role tb-col-md">
                            <span className="overline-title">Role</span>
                        </th>
                        <th className="tb-member-action">
                            <span className="overline-title">Action</span>
                        </th>
                    </tr>
                </thead>
                <tbody className="tb-member-body">
                  {teamData.map((item,index) =>  {
                    return(
                      <tr key={index} className="tb-member-item">
                        <td className="tb-member-info">
                            <div className="user-card">
                                <div className={`user-avatar bg-${item.avatarBg}`}>
                                    {item.image ? <img src={item.image} alt="" /> : <span>{findUpper(item.name)}</span> }
                                </div>
                                <div className="user-info">
                                    <span className="lead-text">{item.name}</span>
                                    <span className="sub-text">{item.email}</span>
                                </div>
                            </div>
                        </td>
                        <td className="tb-member-type tb-col-sm">
                            <span>{item.permission}</span>
                        </td>
                        <td className="tb-member-role tb-col-md">
                            {item.role === 'All' ? <span>All</span> : 
                              <RSelect options={teamRole}
                                defaultValue={[
                                  {
                                    value: item.role,
                                    label: item.role,
                                  },
                                ]}
                              />
                            }
                        </td>
                        <td className="tb-member-action">
                            <div className="d-none d-md-inline">
                                <a href="#" className="link link-sm"><span>Edit</span></a>
                                <a href="#" className="link link-sm link-danger"><span>Remove</span></a>
                            </div>
                            <UncontrolledDropdown className="d-md-none">
                              <DropdownToggle tag="a" className="dropdown-toggle btn btn-icon btn-trigger">
                                <Icon name="more-v"></Icon>
                              </DropdownToggle>
                              <DropdownMenu size="xs" end>
                                <ul className="link-list-plain no-bdr">
                                    <li className="active"><a className="link link-sm" href="#">Edit</a></li>
                                    <li><a className="link link-sm link-danger" href="#">Remove</a></li>
                                </ul>
                              </DropdownMenu>
                            </UncontrolledDropdown>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
            </table>
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default Team;