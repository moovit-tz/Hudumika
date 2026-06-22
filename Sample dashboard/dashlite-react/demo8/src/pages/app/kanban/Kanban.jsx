import React, { useState } from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import classNames from "classnames";
import { DropdownMenu, DropdownToggle, UncontrolledDropdown, DropdownItem, Badge } from "reactstrap";
import { BlockHead, BlockBetween, BlockHeadContent, BlockTitle, Button, Icon, Block, UserAvatar } from "@/components/Component";
import { findUpper } from "@/utils/Utils";

import { DndContext, pointerWithin, useSensors, useSensor, PointerSensor, KeyboardSensor, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import BoardForm from "./partials/BoardForm";
import TaskForm from "./partials/TaskForm";


const list = [
  {
    id: "Open", title:"Open", theme:"light", items: [
      {
        id: "task-1",
        title: "Implement Design into template",
        desc: "Start implementing new design in coding @dashlite",
        meta: {
          users: [{ value: "Sara Dervashi", label: "Sara Dervashi", theme: "light" }],
          tags: [
            { value: "Dashlite", label: "Dashlite", theme: "info" },
            { value: "HTML", label: "HTML", theme: "danger" },
          ],
          date: "15 Dec 2020",
          category: "Frontend",
          comment: "2",
        },
      },
      {
        id: "task-2",
        title: "Dashlite React Version",
        desc: "Implement new UI design in react version @dashlite template as soon as possible.",
        meta: {
          users: [{ value: "Cooper Jones", label: "Cooper Jones", theme: "blue" }],
          tags: [
            { value: "Dashlite", label: "Dashlite", theme: "info" },
            { value: "React", label: "React", theme: "dark" },
          ],
          date: "15 Dec 2020",
          category: "Frontend",
          comment: "5",
          attachment: "3",
        },
      },
    ],
  },
  {
    id: "InProgress", title:"In Progress", theme:"primary", items: [
      {
        id: "task-3",
        title: "Dashlite Design Kit Update",
        desc: "Update the new UI design for @dashlite template with based on feedback.",
        board: "In Progress",
        meta: {
          users: [{ value: "Ashraf Raneem", label: "Ashraf Raneem", theme: "primary" }],
          tags: [
            { value: "Dashlite", label: "Dashlite", theme: "info" },
            { value: "UI Design", label: "UI Design", theme: "warning" },
          ],
          due: "2",
          category: "Design",
          comment: "4",
          attachment: "1",
        },
      },
      {
        id: "task-4",
        title: "Techyspec Keyword Research",
        desc: "Keyword recarch for @techyspec business profile and there other websites, to improve ranking.",
        board: "In Progress",
        meta: {
          users: [{ value: "Vernon Hollander", label: "Vernon Hollander", theme: "danger" }],
          tags: [
            { value: "Techyspec", label: "Techyspec", theme: "dark" },
            { value: "SEO", label: "SEO", theme: "success" },
          ],
          date: "02 Jan 2021",
          category: "Research",
          comment: "21",
          attachment: "31",
        },
      },
      {
        id: "task-5",
        title: "Fitness Next Website Design",
        desc: "Design a awesome website for @fitness_next new product launch.",
        board: "In Progress",
        meta: {
          users: [{ value: "Patrick Newman", label: "Patrick Newman", theme: "pink" }],
          tags: [
            { value: "Fitness Next", label: "Fitness Next", theme: "primary" },
            { value: "UI Design", label: "UI Design", theme: "warning" },
          ],
          due: "8",
          category: "Design",
          comment: "5",
          attachment: "1",
        },
      },
      {
        id: "task-6",
        title: "Runnergy Website Redesign",
        desc: "Redesign there old/backdated website new modern and clean look keeping minilisim in mind.",
        board: "In Progress",
        meta: {
          users: [
            { value: "Jose Fayman", label: "Jose Fayman", theme: "purple" },
            { value: "Indever Clay", label: "Indever City", theme: "success" },
          ],
          tags: [
            { value: "Redesign", label: "Redesign", theme: "light" },
            { value: "UI Design", label: "UI Design", theme: "warning" },
          ],
          date: "10 Jan 2022",
          category: "Design",
          comment: "15",
          attachment: "19",
        },
      },
    ],
  },
  {
    id: "ToReview", title:"To Review", theme:"warning", items: [
      {
        id: "task-7",
        title: "Wordlab Android App",
        desc: "Wordlab Android App with with react native.",
        board: "In Progress",
        meta: {
          users: [{ value: "Jose Fayman", label: "Jose Fayman", theme: "purple" }],
          tags: [
            { value: "Wordlab", label: "Wordlab", theme: "success" },
            { value: "Android", label: "Android", theme: "light" },
          ],
          date: "25 Dec 2022",
          category: "Design",
          comment: "50",
          attachment: "11",
        },
      },
      {
        id: "task-8",
        title: "Oberlo Development",
        desc: "Complete website development for Oberlo limited.",
        board: "To Review",
        meta: {
          users: [
            { value: "Ober Mayers", label: "Ober Mayers", theme: "purple" },
            { value: "Sergei Surnama", label: "Sergei Surnama", theme: "success" },
          ],
          tags: [
            { value: "Oberlo", label: "Oberlo", theme: "info" },
            { value: "Development", label: "Development", theme: "danger" },
          ],
          due: "1",
          category: "Backend",
          comment: "9",
          attachment: "1",
        },
      },
      {
        id: "task-9",
        title: "IOS app for Getsocio",
        desc: "Design and develop app for Getsocio IOS.",
        board: "To Review",
        meta: {
          users: [
            { value: "Jermaine Klaus", label: "Jermaine Klaus", theme: "purple" },
            { value: "Sergei Surnama", label: "Sergei Surnama", theme: "success" },
          ],
          tags: [
            { value: "Getsocio", label: "Getsocio", theme: "dark" },
            { value: "IOS", label: "IOS", theme: "light" },
          ],
          due: "4",
          category: "Frontend",
          comment: "8",
          attachment: "5",
        },
      },
    ],
  },
  {
    id: "Completed", title:"Completed", theme:"success", items: [],
  }
];

const Column = ({id, className, children}) => {
  const { setNodeRef } = useDroppable({
      id: id,
  });
  return (
      <main className={className && className} ref={setNodeRef} >{children}</main>
  )
}
const Item = ({item, children, className}) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
      id: item.id,
  });

  const style = {
      transition,
      transform: CSS.Translate.toString(transform),
  };

  return (
      <div className={className && className} ref={setNodeRef} {...listeners} {...attributes} style={style}>{children}</div>
  )
}


const Kanban = () => {
  const [smBtn, setSmBtn] = useState(false);
  const [addBoardModal, setAddBoardModal] = useState(false);
  const [editBoardModal, setEditBoardModal] = useState(false);
  const [addTaskModal, setAddTaskModal] = useState(false);
  const [editTaskModal, setEditTaskModal] = useState(false);

  const [columns, setColumns] = useState(list);
  
  const sensors = [
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(KeyboardSensor),
  ];

  const findColumn = (unique) => {
    if (!unique) {
      return null;
    }
    
    if (columns.some((c) => c.id === unique)) {
      return columns.find((c) => c.id === unique) ?? null;
    }
    const id = String(unique);
    const itemWithColumnId = columns.flatMap((c) => {
      const columnId = c.id;
      return c.items.map((i) => ({ itemId: i.id, columnId: columnId }));
    });
    const columnId = itemWithColumnId.find((i) => i.itemId === id)?.columnId;
    return columns.find((c) => c.id === columnId) ?? null;
  };

  const handleDragOver = (event) => {
    const { active, over, delta } = event;
    const activeId = String(active.id);
    const overId = over ? String(over.id) : null;
    const activeColumn = findColumn(activeId);
    const overColumn = findColumn(overId);
    if (!activeColumn || !overColumn || activeColumn === overColumn) {
      return null;
    }
    setColumns((prevState) => {
      const activeItems = activeColumn.items;
      const overItems = overColumn.items;
      const activeIndex = activeItems.findIndex((i) => i.id === activeId);
      const overIndex = overItems.findIndex((i) => i.id === overId);
      const newIndex = () => {
        const putOnBelowLastItem =
          overIndex === overItems.length - 1 && delta.y > 0;
        const modifier = putOnBelowLastItem ? 1 : 0;
        return overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
      };
      return prevState.map((c) => {
        if (c.id === activeColumn.id) {
          c.items = activeItems.filter((i) => i.id !== activeId);
          return c;
        } else if (c.id === overColumn.id) {
          c.items = [
            ...overItems.slice(0, newIndex()),
            activeItems[activeIndex],
            ...overItems.slice(newIndex(), overItems.length)
          ];
          return c;
        } else {
          return c;
        }
      });
    });
  };

  const handleDragEnd = (event ) => {
    const { active, over } = event;
    const activeId = String(active.id);
    const overId = over ? String(over.id) : null;
    const activeColumn = findColumn(activeId);
    const overColumn = findColumn(overId);
    if (!activeColumn || !overColumn || activeColumn !== overColumn) {
      return null;
    }
    const activeIndex = activeColumn.items.findIndex((i) => i.id === activeId);
    const overIndex = overColumn.items.findIndex((i) => i.id === overId);
    if (activeIndex !== overIndex) {
      setColumns((prevState) => {
        return prevState.map((column) => {
          if (column.id === activeColumn.id) {
            column.items = arrayMove(overColumn.items, activeIndex, overIndex);
            return column;
          } else {
            return column;
          }
        });
      });
    }

  };  


  return (
    <>
      <Head title="Kanban Board"></Head>
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page>Kanban Board</BlockTitle>
            </BlockHeadContent>
            <BlockHeadContent>
              <div className="toggle-wrap nk-block-tools-toggle">
                <a href="#toggle" onClick={(ev) => { ev.preventDefault(); setSmBtn(!smBtn); }} className="btn btn-icon btn-trigger toggle-expand me-n1">
                  <Icon name="menu-alt-r"></Icon>
                </a>
                <div className={`toggle-expand-content ${smBtn ? "expanded" : ""}`}>
                  <ul className="nk-block-tools g-3">
                    <li>
                      <Button color="light" outline className="btn-white" onClick={() => { setAddTaskModal(true); }} >
                        <Icon name="plus" />
                        <span>Add Task</span>
                      </Button>
                    </li>
                    <li>
                      <Button color="primary" onClick={() => { setAddBoardModal(true); }}>
                        <Icon name="plus" />
                        <span>Add Board</span>
                      </Button>
                    </li>
                  </ul>
                </div>
              </div>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        <Block>
          <div className="nk-kanban">
              <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd} onDragOver={handleDragOver}>
                <div className="kanban-container">
                  {list.map((column, index) => {
                    return (
                      <div key={index} className="kanban-board">
                        <header className={classNames({'kanban-board-header': true, [`kanban-${column.theme}`]: column.theme, 'kanban-light': !column.theme })}>
                          <div className="kanban-title-board">
                            <div className="kanban-title-content">
                              <h6 className="title">{column.title}</h6>
                              <span className="badge rounded-pill bg-outline-light text-dark">{column.items.length}</span>
                            </div>
                            <div className="kanban-title-content">
                            <UncontrolledDropdown >
                              <DropdownToggle tag="a" className="dropdown-toggle btn btn-sm btn-icon btn-trigger me-n1" >
                                <Icon name="more-h"></Icon>
                              </DropdownToggle>
                              <DropdownMenu end>
                                <ul className="link-list-opt no-bdr">
                                  <li>
                                    <DropdownItem tag="a" href="#edit" onClick={(ev) => { ev.preventDefault(); setEditBoardModal(true) }} >
                                      <Icon name="edit"></Icon>
                                      <span>Edit Board</span>
                                    </DropdownItem>
                                  </li>
                                  <li>
                                    <DropdownItem tag="a" href="#add-option" onClick={(ev) => { ev.preventDefault(); }} >
                                      <Icon name="trash"></Icon>
                                      <span>Delete Board</span>
                                    </DropdownItem>
                                  </li>
                                  <li>
                                    <DropdownItem tag="a" href="#add-option" onClick={(ev) => { ev.preventDefault(); }} >
                                      <Icon name="trash-empty"></Icon>
                                      <span>Empty Board</span>
                                    </DropdownItem>
                                  </li>
                                  <li>
                                    <DropdownItem tag="a" href="#add-task" onClick={(ev) => { ev.preventDefault(); setAddTaskModal(true); }} >
                                      <Icon name="plus"></Icon>
                                      <span>Add Task</span>
                                    </DropdownItem>
                                  </li>
                                </ul>
                              </DropdownMenu>
                            </UncontrolledDropdown>
                            </div>
                          </div>
                        </header> {/* .kanban-board-header */}
                        <Column
                          key={column.id}
                          id={column.id}
                          className="kanban-drag"
                        >
                          <SortableContext items={column.items} strategy={verticalListSortingStrategy}>
                            {column.items.map((item) => (
                              <Item key={item.id} item={item} className="kanban-item">
                                <div className="kanban-item-title">
                                  <h6 className="title">{item.title}</h6>
                                  <UncontrolledDropdown >
                                    <DropdownToggle
                                      tag="a"
                                      href="#toggle"
                                      className="dropdown-toggle"
                                      onClick={(ev) => ev.preventDefault()}
                                    >
                                      <div className="user-avatar-group">
                                        {item.meta.users.map((user, index) => (
                                          <UserAvatar key={index} className="xs" theme={user.theme} text={user.value[0]}></UserAvatar>
                                        ))}
                                      </div>
                                    </DropdownToggle>
                                    <DropdownMenu end>
                                      <ul className="link-list-opt no-bdr p-3 g-2">
                                        {item.meta.users.map((user, index) => (
                                          <li key={index}>
                                            <div className="user-card">
                                              <UserAvatar className="sm" theme={user.theme} text={findUpper(user.value)}></UserAvatar>
                                              <div className="user-name">
                                                <span className="tb-lead">{user.value}</span>
                                              </div>
                                            </div>
                                          </li>
                                        ))}
                                      </ul>
                                    </DropdownMenu>
                                  </UncontrolledDropdown>
                                </div>
                                <div className="kanban-item-text">
                                  <p>{item.desc}</p>
                                </div>
                                <ul className="kanban-item-tags">
                                  {item.meta.tags.map((tag, index) => (
                                    <li key={index}>
                                      <Badge color={tag.theme}>{tag.value}</Badge>
                                    </li>
                                  ))}
                                </ul>
                                <div className="kanban-item-meta">
                                  <ul className="kanban-item-meta-list">
                                    {item.meta.date ? (
                                      <li>
                                        <Icon name="calendar"></Icon>
                                        <span>{item.meta.date}</span>
                                      </li>
                                    ) : (
                                      <li className={Number(item.meta.due) < 5 ? "text-danger" : ""}>
                                        <Icon name="calendar"></Icon>
                                        <span>{item.meta.due}d Due</span>
                                      </li>
                                    )}
                                    <li>
                                      <Icon name="notes"></Icon>
                                      <span>{item.meta.category}</span>
                                    </li>
                                  </ul>
                                  <ul className="kanban-item-meta-list">
                                    <UncontrolledDropdown >
                                      <DropdownToggle
                                        tag="a"
                                        href="toggle"
                                        onClick={(ev) => ev.preventDefault()}
                                        className="dropdown-toggle btn btn-xs btn-icon btn-trigger me-n1"
                                      >
                                        <Icon name="more-v"></Icon>
                                      </DropdownToggle>
                                      <DropdownMenu end>
                                        <ul className="link-list-opt no-bdr">
                                          <li>
                                            <DropdownItem tag="a" href="#item"
                                              onClick={(ev) => {
                                                ev.preventDefault();
                                                setEditTaskModal(true);
                                              }}
                                            >
                                              <Icon name="edit"></Icon>
                                              <span>Edit Task</span>
                                            </DropdownItem>
                                          </li>
                                          <li>
                                            <DropdownItem tag="a" href="#item"
                                              onClick={(ev) => {
                                                ev.preventDefault();
                                              }}
                                            >
                                              <Icon name="trash"></Icon>
                                              <span>Delete Task</span>
                                            </DropdownItem>
                                          </li>
                                        </ul>
                                      </DropdownMenu>
                                    </UncontrolledDropdown>
                                  </ul>
                                </div>
                              </Item>
                            ))}
                          </SortableContext>
                        </Column>
                        <footer>
                          <Button className="kanban-add-task btn-block" onClick={() => { setAddBoardModal(true); }}>
                            <Icon name="plus-sm"></Icon>
                            <span>{column.items.length > 0 ? "Add another " : "Add "} task</span>
                          </Button>
                        </footer>
                      </div>
                    );
                  })}
                </div>
              </DndContext>
          </div>
        </Block>
      </Content>

      <BoardForm toggle={setAddBoardModal} isOpen={addBoardModal} />
      <BoardForm edit={true} toggle={setEditBoardModal} isOpen={editBoardModal} />
      <TaskForm toggle={setAddTaskModal} isOpen={addTaskModal} />
      <TaskForm edit={true} toggle={setEditTaskModal} isOpen={editTaskModal} />

    </>
  );
};

export default Kanban;
