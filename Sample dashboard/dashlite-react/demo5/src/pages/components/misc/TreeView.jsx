import React, { useState } from "react";
import Tree from 'rc-tree';
import Head from "@/layout/head/Head";
import Content from "@/layout/content/Content";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  BlockDes,
  BackTo,
  PreviewCard,
  CodeBlock,
} from "@/components/Component";

const Icon = ({ name, color }) => (
  <span className={`ni ni-${name} text-${color}`} />
);

function allowDrop({ dropNode, dropPosition }) {
  if (!dropNode.children) {
    if (dropPosition === 0) return false;
  }
  return true;
}

function getCustonIconTreeData() {
  return [
    {
      key: 'root-node-1',
      title: 'Root node 1',
      children: [
        { key: 'child-node', title: 'Child Node' },
        { key: 'initially-selected', title: 'Initially selected', icon: <Icon name='calendar-fill' color='info'/> },
        {
          key: 'initially-open',
          title: 'Initially Open',
          children: [
            { key: 'disabled-node', title: 'Disabled Node', disabled: true, icon: <Icon name='archive-fill' color='gray'/> },
            { key: 'another-node', title: ' Another node' },
          ],
        },
      ],
    },
    {
      key: 'root-node-2',
      title: 'Root node 1',
    },
  ];
}

function getBasicTreeData() {
  return [
    {
      key: 'root-node-1',
      title: 'Root node 1',
      children: [
        { key: 'child-node', title: 'Child Node' },
        { key: 'initially-selected', title: 'Initially selected' },
        {
          key: 'initially-open',
          title: 'Initially Open',
          children: [
            { key: 'disabled-node', title: 'Disabled Node', disabled: true },
            { key: 'another-node', title: ' Another node' },
          ],
        },
      ],
    },
    {
      key: 'root-node-2',
      title: 'Root node 1',
    },
  ];
}

function getDragDropTreeData() {
  return [
    {
      key: 'root-node-1',
      title: 'Root node 1',
      children: [
        { key: 'child-node', title: 'Child Node' },
        { key: 'initially-selected', title: 'Initially selected' },
        {
          key: 'initially-open',
          title: 'Initially Open',
          children: [
            { key: 'disabled-node', title: 'Disabled Node', disabled: true },
            { key: 'another-node', title: ' Another node' },
          ],
        },
      ],
    },
    {
      key: 'root-node-2',
      title: 'Root node 1',
    },
  ];
}
function getCheckboxTreeData() {
  return [
    {
      key: 'root-node-1',
      title: 'Root node 1',
      children: [
        { key: 'child-node', title: 'Child Node' },
        { key: 'initially-selected', title: 'Initially selected' },
        {
          key: 'initially-open',
          title: 'Initially Open',
          children: [
            { key: 'disabled-node', title: 'Disabled Node', disabled: true },
            { key: 'another-node', title: ' Another node' },
          ],
        },
      ],
    },
    {
      key: 'root-node-2',
      title: 'Root node 1',
    },
  ];
}

const TreeViewPreview = () => {
  
  const [dragable, setDragable] = useState({
    gData: getDragDropTreeData(),
    autoExpandParent: true,
  });

  const onDrop = info => {
    const dropKey = info.node.key;
    const dragKey = info.dragNode.key;
    const dropPos = info.node.pos.split('-');
    const dropPosition = info.dropPosition - Number(dropPos[dropPos.length - 1]);

    const loop = (data, key, callback) => {
      data.forEach((item, index, arr) => {
        if (item.key === key) {
          callback(item, index, arr);
          return;
        }
        if (item.children) {
          loop(item.children, key, callback);
        }
      });
    };
    const data = [...dragable.gData];

    // Find dragObject
    let dragObj;
    loop(data, dragKey, (item, index, arr) => {
      arr.splice(index, 1);
      dragObj = item;
    });

    if (dropPosition === 0) {
      loop(data, dropKey, item => {
        // eslint-disable-next-line no-param-reassign
        item.children = item.children || [];
        item.children.unshift(dragObj);
      });
    } else {
      let ar;
      let i;
      loop(data, dropKey, (item, index, arr) => {
        ar = arr;
        i = index;
      });
      if (dropPosition === -1) {
        ar.splice(i, 0, dragObj);
      } else {
        ar.splice(i + 1, 0, dragObj);
      }
    }
    setDragable({
      gData: data,
    });
  };

  return (
    <>
      <Head title="Tree View"></Head>
      <Content page="component">
        <BlockHead size="lg" wide="sm">
          <BlockHeadContent>
            <BackTo link="/components" icon="arrow-left">
              Components
            </BackTo>
            <BlockTitle tag="h2" className="fw-normal">
              Tree View
            </BlockTitle>
            <BlockDes>
              <p className="lead">
                React rc-tree is a plugin, that provides interactive trees. It' i's
                easily extendable, themable and configurable, it supports JSX & JSON data sources.
              </p>
              <p className="lead">
                For more info please visit{" "}
                <a href="https://www.npmjs.com/package/rc-tree" target="_blank" rel="noreferrer">
                  React rc-tree
                </a>
                .
              </p>
            </BlockDes>
          </BlockHeadContent>
        </BlockHead>

        <Block size="lg">
          <BlockHead>
            <BlockHeadContent>
              <BlockTitle tag="h5">Basic</BlockTitle>
              <BlockDes>
                Just import <code>Tree</code> component from <code>rc-tree</code> plugin.
              </BlockDes>
            </BlockHeadContent>
          </BlockHead>
          <PreviewCard>
            <Tree
              showLine
              defaultExpandAll={true}
              treeData={getBasicTreeData()}
            />
          </PreviewCard>
          <CodeBlock language="jsx">
{`<Tree
  showLine
  defaultExpandAll={true}
  treeData={getBasicTreeData()}
/>`}
          </CodeBlock>
        </Block>

        <Block size="lg">
          <BlockHead>
            <BlockHeadContent>
              <BlockTitle tag="h5">Custom Icon</BlockTitle>
              <BlockDes>
                Custom icons can be passed in the <code>jsx markup</code> with each node, use the <code>icon</code>{" "}
                property.
              </BlockDes>
            </BlockHeadContent>
          </BlockHead>
          <PreviewCard>
            <Tree
              showLine
              defaultExpandAll={true}
              treeData={getCustonIconTreeData()}
            />
          </PreviewCard>
          <CodeBlock language="jsx">
{`<Tree
  showLine
  defaultExpandAll={true}
  treeData={getCustonIconTreeData()}
/>`}
          </CodeBlock>
        </Block>

        <Block size="lg">
          <BlockHead>
            <BlockHeadContent>
              <BlockTitle tag="h5">Drag and Drop</BlockTitle>
              <BlockDes>
                You can enable drag and drop option easily with our example.
              </BlockDes>
            </BlockHeadContent>
          </BlockHead>
          <PreviewCard>
            <Tree
              showLine
              draggable
              allowDrop={allowDrop}
              defaultExpandAll={true}
              onDrop={onDrop}
              treeData={(dragable.gData)}
            />
          </PreviewCard>
          <CodeBlock language="jsx">
{`<Tree
  showLine
  draggable
  allowDrop={allowDrop}
  defaultExpandAll={true}
  onDrop={onDrop}
  treeData={(dragable.gData)}
/>`}
          </CodeBlock>
        </Block>

        <Block size="lg">
          <BlockHead>
            <BlockHeadContent>
              <BlockTitle tag="h5">CheckBox</BlockTitle>
              <BlockDes>
                <p>
                  To activate checkbox option, just add <code>checkable</code> props on tree component.
                </p>
              </BlockDes>
            </BlockHeadContent>
          </BlockHead>
          <PreviewCard>
            <Tree
              checkable
              defaultExpandAll={true}
              treeData={getCustonIconTreeData()}
            />
          </PreviewCard>
          <CodeBlock language="jsx">
{`<Tree
  checkable
  defaultExpandAll={true}
  treeData={getCustonIconTreeData()}
/>`}
          </CodeBlock>
        </Block>
      </Content>
    </>
  );
};

export default TreeViewPreview;
