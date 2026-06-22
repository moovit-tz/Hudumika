import React, { useState } from "react";
import DatePicker from "react-datepicker";
import Select from "react-select";
import { Modal, ModalBody,  Col } from "reactstrap";
import { Icon, Button, RSelect } from "@/components/Component";
import { getDateStructured } from "@/utils/Utils";
import { useForm } from "react-hook-form";
import { ColorOptions } from "@/components/partials/color-select-menu/ColorMenu";

const BoardForm = ({ toggle, isOpen, edit }) => {
    const { register, handleSubmit, formState: { errors } } = useForm();
    
    const tagSet = [
        {
          value: "Dashlite",
          label: "Dashlite",
          theme: "info",
        },
        {
          value: "HTML",
          label: "HTML",
          theme: "danger",
        },
        {
          value: "UI Design",
          label: "UI Design",
          theme: "warning",
        },
        {
          value: "React",
          label: "React",
          theme: "dark",
        },
        {
          value: "Techyspec",
          label: "Techyspec",
          theme: "dark",
        },
        {
          value: "Development",
          label: "Development",
          theme: "danger",
        },
        {
          value: "SEO",
          label: "SEO",
          theme: "success",
        },
        {
          value: "IOS",
          label: "IOS",
          theme: "grey",
        },
    ];
      
    const teamList = [
        { value: "Abu Bin", label: "Abu Bin", theme: "purple" },
        { value: "Newman John", label: "Newman John", theme: "primary" },
        { value: "Milagros Betts", label: "Milagros Betts", theme: "purple" },
        { value: "Joshua Wilson", label: "Joshua Wilson", theme: "pink" },
        { value: "Ryu Duke", label: "Ryu Duke", theme: "orange" },
        { value: "Aliah Pitts", label: "Aliah Pitts", theme: "blue" },
    ];

    const boardOptions = [
        {
            id: "column-open",
            value: "Open",
            label: "Open",
        },
        {
            id: "column-progress",
            value: "In Progress",
            label: "In Progress",
        },
        {
            id: "column-review",
            value: "To Review",
            label: "To Review",
        },
        {
            id: "column-completed",
            value: "Completed",
            label: "Completed",
        },
    ]

    const [formData, setFormData] = useState({
        title: "",
        desc: "",
        category:  "",
        date: new Date(),
        due: "",
        board: null,
        tags:  [tagSet[0]],
        users: [teamList[0]],
    });

    return (
        <Modal size="lg" isOpen={isOpen} toggle={toggle}>
            <ModalBody>
                <a href="#cancel" className="close"
                    onClick={(ev) => {
                        ev.preventDefault(); toggle();
                    }}
                >
                    <Icon name="cross-sm"></Icon>
                </a>
                <div className="p-2">
                    <h5 className="title">{edit ? "Update" : "Add"} Task</h5>
                    <div className="mt-4">
                        <form className="row gy-4" onSubmit={(e) => e.preventDefault()}>
                            <Col sm="6">
                                <div className="form-group">
                                    <label className="form-label">Task Title</label>
                                    <input
                                        type="text"
                                        {...register('title', { required: "This field is required" })}
                                        value={formData.title}
                                        onChange={(e) =>
                                            setFormData({
                                            ...formData,
                                            title: e.target.value,
                                            })
                                        }
                                    className="form-control" />
                                    {errors.title && <span className="invalid">{errors.title.message}</span>}
                                </div>
                            </Col>
                            <Col sm="6">
                                <div className="form-group">
                                    <label className="form-label">Select Board</label>
                                    <RSelect
                                    defaultValue={boardOptions[0]}
                                    isDisabled={false}
                                    options={boardOptions}
                                    placeholder="Select a board"
                                    onChange={(e) => {
                                        setFormData({ ...formData, board: e });
                                    }}
                                    />
                                </div>
                            </Col>
                            <Col className="col-12">
                                <div className="form-group">
                                    <label className="form-label">Task Description</label>
                                    <textarea
                                    {...register('desc', { required: "This field is required" })}
                                    value={formData.desc}
                                    onChange={(e) =>
                                        setFormData({
                                        ...formData,
                                        desc: e.target.value,
                                        })
                                    }
                                    className="form-control no-resize" />
                                    {errors.desc && <span className="invalid">{errors.desc.message}</span>}
                                </div>
                            </Col>
                            <Col sm="6">
                                <div className="form-group">
                                    <label className="form-label">Task Category</label>
                                    <input
                                    type="text"
                                    {...register('category', { required: "This field is required" })}
                                    value={formData.category}
                                    onChange={(e) =>
                                        setFormData({
                                        ...formData,
                                        category: e.target.value,
                                        })
                                    }
                                    className="form-control" />
                                    {errors.category && <span className="invalid">{errors.category.message}</span>}
                                </div>
                            </Col>
                            <Col sm="6">
                                <div className="form-group">
                                    <label className="form-label">Date</label>
                                    <DatePicker
                                    selected={formData.date}
                                    onChange={(date) => setFormData({ ...formData, date: date })}
                                    className="form-control date-picker"
                                    />
                                </div>
                            </Col>
                            <Col sm="6">
                                <div className="form-group">
                                    <label className="form-label">Task Tags</label>
                                    <RSelect
                                    options={tagSet}
                                    isMulti
                                    defaultValue={formData.tags}
                                    onChange={(e) => setFormData({ ...formData, tags: e })}
                                    />
                                </div>
                            </Col>
                            <Col sm="6">
                                <div className="form-group">
                                    <label className="form-label">Users Assigned</label>
                                    <RSelect
                                    options={teamList}
                                    isMulti
                                    defaultValue={formData.users}
                                    onChange={(e) => setFormData({ ...formData, users: e })}
                                    />
                                </div>
                            </Col>
                            <Col className="col-12">
                                <div className="d-flex justify-content-between mt-3">
                                    <ul className="align-center flex-wrap flex-sm-nowrap gx-4 gy-2">
                                        <li>
                                            <Button color="primary" size="md" type="submit">
                                            {edit ? "Update" : "Add"} Task
                                            </Button>
                                        </li>
                                        <li>
                                            <Button
                                            onClick={(ev) => {
                                                ev.preventDefault();
                                                toggle();
                                            }}
                                            className="link link-light"
                                            >
                                            Cancel
                                            </Button>
                                        </li>
                                    </ul>
                                    {edit && (
                                    <ul>
                                        <li>
                                        <Button color="danger" size="md" onClick={() => deleteTask()}>
                                            Delete Task
                                        </Button>
                                        </li>
                                    </ul>
                                    )}
                                </div>
                            </Col>
                        </form>
                    </div>
                </div>
            </ModalBody>
        </Modal>
    );
};

export default BoardForm;