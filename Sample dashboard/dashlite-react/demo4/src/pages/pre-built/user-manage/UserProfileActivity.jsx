import React from "react";
import Head from "@/layout/head/Head";
import {
  BlockBetween,
  BlockDes,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Icon,
  LoginLogTable,
} from "@/components/Component";

const UserProfileActivityPage = () => {
  return (
    <React.Fragment>
      <Head title="User List - Profile"></Head>
      <BlockHead size="lg">
        <BlockBetween>
          <BlockHeadContent>
            <BlockTitle tag="h4">Login Activity</BlockTitle>
            <BlockDes>
              <p>
                Here is your last 20 login activities log.{" "}
                <span className="text-soft">
                  <Icon name="info" />
                </span>
              </p>
            </BlockDes>
          </BlockHeadContent>
        </BlockBetween>
      </BlockHead>
      <LoginLogTable />
    </React.Fragment>
  );
};
export default UserProfileActivityPage;
