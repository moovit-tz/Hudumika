<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
    <title>Limitless - Responsive Web Application Kit by Themesbrand</title>

    <!-- Global stylesheets -->
    <link href="{{URL::asset('assets/fonts/inter/inter.css')}}" rel="stylesheet" type="text/css">
    <link href="{{URL::asset('assets/icons/phosphor/styles.min.css')}}" rel="stylesheet" type="text/css">
    <link href="{{URL::asset('assets/css/all.min.css')}}" id="stylesheet" rel="stylesheet" type="text/css">
    <!-- /global stylesheets -->

    <!-- Core JS files -->
    <script src="{{URL::asset('assets/demo/demo_configurator.js')}}"></script>
    <script src="{{URL::asset('assets/js/bootstrap/bootstrap.bundle.min.js')}}"></script>
    <!-- /core JS files -->

    <!-- Theme JS files -->
    <script src="{{URL::asset('assets/js/vendor/ui/prism.min.js')}}"></script>

    <script src="{{URL::asset('assets/js/app.js')}}"></script>
    <!-- /theme JS files -->

</head>

<body>

    <!-- Main navbar -->
    <div class="navbar navbar-expand-xl navbar-static shadow">
        <div class="container-fluid">
            <div class="d-flex d-xl-none me-2">
                <button type="button" class="navbar-toggler sidebar-mobile-main-toggle rounded-pill">
                    <i class="ph-list"></i>
                </button>
            </div>

            <div class="d-flex flex-1">
                <div class="navbar-brand">
                    <a href="index" class="d-inline-flex align-items-center">
                        <img src="{{URL::asset('assets/images/logo_icon.svg')}}" alt="">
                        <img src="{{URL::asset('assets/images/logo_text_dark.svg')}}" class="d-none d-sm-inline-block h-16px invert-dark ms-3" alt="">
                    </a>
                </div>

                <a href="#" class="navbar-nav-link navbar-nav-link-icon rounded-pill sidebar-control sidebar-main-toggle d-none d-lg-flex">
                    <i class="ph-arrows-left-right"></i>
                </a>
            </div>

            <div class="d-flex w-100 w-xl-auto overflow-auto overflow-xl-visible scrollbar-hidden border-top border-top-xl-0 order-1 order-xl-0 pt-2 pt-xl-0 mt-2 mt-xl-0">
                <ul class="nav gap-1 justify-content-center flex-nowrap flex-xl-wrap mx-auto">
                    <li class="nav-item">
                        <a href="index" class="navbar-nav-link rounded">
                            <i class="ph-house me-2"></i>
                            Home
                        </a>
                    </li>

                    <li class="nav-item nav-item-dropdown">
                        <a href="#" class="navbar-nav-link dropdown-toggle rounded" data-bs-toggle="dropdown" data-bs-auto-close="outside">
                            <i class="ph-rows me-2"></i>
                            Navigation
                        </a>

                        <div class="dropdown-menu p-0">
                            <div class="d-xl-flex">
                                <div class="d-flex flex-row flex-xl-column bg-light overflow-auto overflow-xl-visible rounded-top rounded-top-xl-0 rounded-start-xl">
                                    <div class="flex-1 border-bottom border-bottom-xl-0 p-2 p-xl-3">
                                        <div class="fw-bold border-bottom d-none d-xl-block pb-2 mb-2">Navigation</div>
                                        <ul class="nav nav-pills flex-xl-column flex-nowrap text-nowrap justify-content-center wmin-xl-300" role="tablist">
                                            <li class="nav-item" role="presentation">
                                                <a href="#tab_page" class="nav-link rounded" data-bs-toggle="tab" aria-selected="false" role="tab">
                                                    <i class="ph-layout me-2"></i>
                                                    Page
                                                    <i class="ph-arrow-right nav-item-active-indicator d-none d-xl-inline-block ms-auto"></i>
                                                </a>
                                            </li>
                                            <li class="nav-item" role="presentation">
                                                <a href="#tab_navbars" class="nav-link rounded" data-bs-toggle="tab" aria-selected="false" tabindex="-1" role="tab">
                                                    <i class="ph-rows me-2"></i>
                                                    Navbars
                                                    <i class="ph-arrow-right nav-item-active-indicator d-none d-xl-inline-block ms-auto"></i>
                                                </a>
                                            </li>
                                            <li class="nav-item" role="presentation">
                                                <a href="#tab_sidebar_types" class="nav-link rounded" data-bs-toggle="tab" aria-selected="true" tabindex="-1" role="tab">
                                                    <i class="ph-columns me-2"></i>
                                                    Sidebar types
                                                    <i class="ph-arrow-right nav-item-active-indicator d-none d-xl-inline-block ms-auto"></i>
                                                </a>
                                            </li>
                                            <li class="nav-item" role="presentation">
                                                <a href="#tab_sidebar_content" class="nav-link rounded" data-bs-toggle="tab" aria-selected="false" tabindex="-1" role="tab">
                                                    <i class="ph-sidebar-simple me-2"></i>
                                                    Sidebar content
                                                    <i class="ph-arrow-right nav-item-active-indicator d-none d-xl-inline-block ms-auto"></i>
                                                </a>
                                            </li>
                                            <li class="nav-item" role="presentation">
                                                <a href="#tab_navigation" class="nav-link rounded" data-bs-toggle="tab" aria-selected="false" tabindex="-1" role="tab">
                                                    <i class="ph-list-dashes me-2"></i>
                                                    Navigation
                                                    <i class="ph-arrow-right nav-item-active-indicator d-none d-xl-inline-block ms-auto"></i>
                                                </a>
                                            </li>
                                        </ul>
                                    </div>
                                </div>

                                <div class="tab-content flex-xl-1">
                                    <div class="tab-pane dropdown-scrollable-xl fade p-3" id="tab_page" role="tabpanel">
                                        <div class="row">
                                            <div class="col-lg-4 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Sections</div>
                                                <a href="layout_no_header" class="dropdown-item rounded">No header</a>
                                                <a href="layout_no_footer" class="dropdown-item rounded">No footer</a>
                                                <a href="layout_fixed_header" class="dropdown-item rounded">Fixed header</a>
                                                <a href="layout_fixed_footer" class="dropdown-item rounded">Fixed footer</a>
                                            </div>

                                            <div class="col-lg-4 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Sidebars</div>
                                                <a href="layout_2_sidebars_1_side" class="dropdown-item rounded">2 sidebars on 1 side</a>
                                                <a href="layout_2_sidebars_2_sides" class="dropdown-item rounded">2 sidebars on 2 sides</a>
                                                <a href="layout_3_sidebars" class="dropdown-item rounded">3 sidebars</a>
                                            </div>

                                            <div class="col-lg-4">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Layout</div>
                                                <a href="layout_static" class="dropdown-item rounded">Static layout</a>
                                                <a href="layout_boxed_page" class="dropdown-item rounded">Boxed page</a>
                                                <a href="layout_liquid_content" class="dropdown-item rounded">Liquid content</a>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="tab-pane dropdown-scrollable-xl fade p-3" id="tab_navbars" role="tabpanel">
                                        <div class="row">
                                            <div class="col-lg-3 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Single</div>
                                                <a href="navbar_single_top_static" class="dropdown-item rounded">Top static</a>
                                                <a href="navbar_single_top_fixed" class="dropdown-item rounded">Top fixed</a>
                                                <a href="navbar_single_bottom_static" class="dropdown-item rounded">Bottom static</a>
                                                <a href="navbar_single_bottom_fixed" class="dropdown-item rounded">Bottom fixed</a>
                                            </div>

                                            <div class="col-lg-3 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Multiple</div>
                                                <a href="navbar_multiple_top_static" class="dropdown-item rounded">Top static</a>
                                                <a href="navbar_multiple_top_fixed" class="dropdown-item rounded">Top fixed</a>
                                                <a href="navbar_multiple_bottom_static" class="dropdown-item rounded">Bottom static</a>
                                                <a href="navbar_multiple_bottom_fixed" class="dropdown-item rounded">Bottom fixed</a>
                                                <a href="navbar_multiple_top_bottom_fixed" class="dropdown-item rounded">Top and bottom fixed</a>
                                            </div>

                                            <div class="col-lg-3 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Content</div>
                                                <a href="navbar_component_single" class="dropdown-item rounded">Single navbar</a>
                                                <a href="navbar_component_multiple" class="dropdown-item rounded">Multiple navbars</a>
                                            </div>

                                            <div class="col-lg-3">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Other</div>
                                                <a href="navbar_colors" class="dropdown-item rounded">Color options</a>
                                                <a href="navbar_sizes" class="dropdown-item rounded">Sizing options</a>
                                                <a href="navbar_components" class="dropdown-item rounded">Navbar components</a>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="tab-pane dropdown-scrollable-xl fade show p-3" id="tab_sidebar_types" role="tabpanel">
                                        <div class="row">
                                            <div class="col-lg-3 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Main</div>
                                                <a href="sidebar_default_resizable" class="dropdown-item rounded">Resizable</a>
                                                <a href="sidebar_default_resized" class="dropdown-item rounded">Resized</a>
                                                <a href="sidebar_default_collapsible" class="dropdown-item rounded">Collapsible</a>
                                                <a href="sidebar_default_collapsed" class="dropdown-item rounded">Collapsed</a>
                                                <a href="sidebar_default_hideable" class="dropdown-item rounded">Hideable</a>
                                                <a href="sidebar_default_hidden" class="dropdown-item rounded">Hidden</a>
                                                <a href="sidebar_default_color_dark" class="dropdown-item rounded">Dark color</a>
                                            </div>

                                            <div class="col-lg-3 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Secondary</div>
                                                <a href="sidebar_secondary_collapsible" class="dropdown-item rounded">Collapsible</a>
                                                <a href="sidebar_secondary_collapsed" class="dropdown-item rounded">Collapsed</a>
                                                <a href="sidebar_secondary_hideable" class="dropdown-item rounded">Hideable</a>
                                                <a href="sidebar_secondary_hidden" class="dropdown-item rounded">Hidden</a>
                                                <a href="sidebar_secondary_color_dark" class="dropdown-item rounded">Dark color</a>
                                            </div>

                                            <div class="col-lg-3 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Right</div>
                                                <a href="sidebar_right_collapsible" class="dropdown-item rounded">Collapsible</a>
                                                <a href="sidebar_right_collapsed" class="dropdown-item rounded">Collapsed</a>
                                                <a href="sidebar_right_hideable" class="dropdown-item rounded">Hideable</a>
                                                <a href="sidebar_right_hidden" class="dropdown-item rounded">Hidden</a>
                                                <a href="sidebar_right_color_dark" class="dropdown-item rounded">Dark color</a>
                                            </div>

                                            <div class="col-lg-3">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Content</div>
                                                <a href="sidebar_content_left" class="dropdown-item rounded">Left aligned</a>
                                                <a href="sidebar_content_left_stretch" class="dropdown-item rounded">Left stretched</a>
                                                <a href="sidebar_content_left_sections" class="dropdown-item rounded">Left sectioned</a>
                                                <a href="sidebar_content_right" class="dropdown-item rounded">Right aligned</a>
                                                <a href="sidebar_content_right_stretch" class="dropdown-item rounded">Right stretched</a>
                                                <a href="sidebar_content_right_sections" class="dropdown-item rounded">Right sectioned</a>
                                                <a href="sidebar_content_color_dark" class="dropdown-item rounded">Dark color</a>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="tab-pane dropdown-scrollable-xl fade p-3" id="tab_sidebar_content" role="tabpanel">
                                        <div class="row">
                                            <div class="col-lg-6 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Sticky areas</div>
                                                <a href="sidebar_sticky_header" class="dropdown-item rounded">Header</a>
                                                <a href="sidebar_sticky_footer" class="dropdown-item rounded">Footer</a>
                                                <a href="sidebar_sticky_header_footer" class="dropdown-item rounded">Header and footer</a>
                                                <a href="sidebar_sticky_custom" class="dropdown-item rounded">Custom elements</a>
                                            </div>

                                            <div class="col-lg-6">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Other</div>
                                                <a href="sidebar_components" class="dropdown-item rounded">Sidebar components</a>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="tab-pane dropdown-scrollable-xl fade p-3" id="tab_navigation" role="tabpanel">
                                        <div class="row">
                                            <div class="col-lg-6 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Vertical</div>
                                                <a href="navigation_vertical_styles" class="dropdown-item rounded">Navigation styles</a>
                                                <a href="navigation_vertical_collapsible" class="dropdown-item rounded">Collapsible menu</a>
                                                <a href="navigation_vertical_accordion" class="dropdown-item rounded">Accordion menu</a>
                                                <a href="navigation_vertical_bordered" class="dropdown-item rounded">Bordered navigation</a>
                                                <a href="navigation_vertical_right_icons" class="dropdown-item rounded">Right icons</a>
                                                <a href="navigation_vertical_badges" class="dropdown-item rounded">Badges</a>
                                                <a href="navigation_vertical_disabled" class="dropdown-item rounded">Disabled items</a>
                                            </div>

                                            <div class="col-lg-6">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Horizontal</div>
                                                <a href="navigation_horizontal_styles" class="dropdown-item rounded">Navigation styles</a>
                                                <a href="navigation_horizontal_elements" class="dropdown-item rounded">Navigation elements</a>
                                                <a href="navigation_horizontal_tabs" class="dropdown-item rounded">Tabbed navigation</a>
                                                <a href="navigation_horizontal_disabled" class="dropdown-item rounded">Disabled items</a>
                                                <a href="navigation_horizontal_mega" class="dropdown-item rounded">Mega menu</a>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </li>

                    <li class="nav-item nav-item-dropdown-xl dropdown">
                        <a href="#" class="navbar-nav-link dropdown-toggle rounded" data-bs-toggle="dropdown">
                            <i class="ph-arrows-clockwise me-2"></i>
                            Switch
                        </a>

                        <div class="dropdown-menu dropdown-menu-end">
                            <div class="dropdown-submenu dropdown-submenu-start">
                                <a href="#" class="dropdown-item dropdown-toggle">
                                    <i class="ph-swatches me-2"></i>
                                    Themes
                                </a>
                                <div class="dropdown-menu">
                                    <a href="index" class="dropdown-item active">Default</a>
                                    <a href="javascript:void(0)" class="dropdown-item disabled">
                                        Material
                                        <span class="opacity-75 fs-sm ms-auto">Coming soon</span>
                                    </a>
                                    <a href="javascript:void(0)" class="dropdown-item disabled">
                                        Clean
                                        <span class="opacity-75 fs-sm ms-auto">Coming soon</span>
                                    </a>
                                </div>
                            </div>
                        </div>
                    </li>
                </ul>
            </div>

            <ul class="nav gap-1 flex-xl-1 justify-content-end order-0 order-xl-1">
                <li class="nav-item nav-item-dropdown-xl dropdown">
                    <a href="#" class="navbar-nav-link navbar-nav-link-icon rounded-pill" data-bs-toggle="dropdown">
                        <i class="ph-squares-four"></i>
                    </a>

                    <div class="dropdown-menu dropdown-menu-end dropdown-menu-scrollable-sm wmin-xl-600 p-0">
                        <div class="d-flex align-items-center border-bottom p-3">
                            <h6 class="mb-0">Browse apps</h6>
                            <a href="#" class="ms-auto">
                                View all
                                <i class="ph-arrow-circle-right ms-1"></i>
                            </a>
                        </div>

                        <div class="row row-cols-1 row-cols-sm-2 g-0">
                            <div class="col">
                                <button type="button" class="dropdown-item text-wrap h-100 align-items-start border-end-sm border-bottom p-3">
                                    <div>
                                        <img src="{{URL::asset('assets/images/demo/logos/1.svg')}}" class="h-40px mb-2" alt="">
                                        <div class="fw-semibold my-1">Customer data platform</div>
                                        <div class="text-muted">Unify customer data from multiple sources</div>
                                    </div>
                                </button>
                            </div>

                            <div class="col">
                                <button type="button" class="dropdown-item text-wrap h-100 align-items-start border-bottom p-3">
                                    <div>
                                        <img src="{{URL::asset('assets/images/demo/logos/2.svg')}}" class="h-40px mb-2" alt="">
                                        <div class="fw-semibold my-1">Data catalog</div>
                                        <div class="text-muted">Discover, inventory, and organize data assets</div>
                                    </div>
                                </button>
                            </div>

                            <div class="col">
                                <button type="button" class="dropdown-item text-wrap h-100 align-items-start border-end-sm border-bottom border-bottom-sm-0 rounded-bottom-start p-3">
                                    <div>
                                        <img src="{{URL::asset('assets/images/demo/logos/3.svg')}}" class="h-40px mb-2" alt="">
                                        <div class="fw-semibold my-1">Data governance</div>
                                        <div class="text-muted">The collaboration hub and data marketplace</div>
                                    </div>
                                </button>
                            </div>

                            <div class="col">
                                <button type="button" class="dropdown-item text-wrap h-100 align-items-start rounded-bottom-end p-3">
                                    <div>
                                        <img src="{{URL::asset('assets/images/demo/logos/4.svg')}}" class="h-40px mb-2" alt="">
                                        <div class="fw-semibold my-1">Data privacy</div>
                                        <div class="text-muted">Automated provisioning of non-production datasets</div>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                </li>

                <li class="nav-item">
                    <a href="#" class="navbar-nav-link navbar-nav-link-icon rounded-pill" data-bs-toggle="offcanvas" data-bs-target="#notifications">
                        <i class="ph-bell"></i>
                        <span class="badge bg-yellow text-black position-absolute top-0 end-0 translate-middle-top zindex-1 rounded-pill mt-1 me-1">2</span>
                    </a>
                </li>

                <li class="nav-item nav-item-dropdown-xl dropdown">
                    <a href="#" class="navbar-nav-link align-items-center rounded-pill p-1" data-bs-toggle="dropdown">
                        <div class="status-indicator-container">
                            <img src="@if (Auth::user()->avatar != ''){{ URL::asset('images/' . Auth::user()->avatar) }}@else{{ URL::asset('assets/images/users/avatar-1.jpg') }}@endif" class="w-32px h-32px rounded-pill" alt="">
                            <span class="status-indicator bg-success"></span>
                        </div>
                        <span class="d-none d-md-inline-block mx-md-2">{{Auth::user()->name}}</span>
                    </a>

                    <div class="dropdown-menu dropdown-menu-end">
                        <a href="#" class="dropdown-item">
                            <i class="ph-user-circle me-2"></i>
                            My profile
                        </a>
                        <a href="#" class="dropdown-item">
                            <i class="ph-currency-circle-dollar me-2"></i>
                            My subscription
                        </a>
                        <a href="#" class="dropdown-item">
                            <i class="ph-shopping-cart me-2"></i>
                            My orders
                        </a>
                        <a href="#" class="dropdown-item">
                            <i class="ph-envelope-open me-2"></i>
                            My inbox
                            <span class="badge bg-primary rounded-pill ms-auto">26</span>
                        </a>
                        <div class="dropdown-divider"></div>
                        <a href="#" class="dropdown-item">
                            <i class="ph-gear me-2"></i>
                            Account settings
                        </a>
                        <a class="dropdown-item" href="{{ route('logout') }}" onclick="event.preventDefault();
	                                                     document.getElementById('logout-form').submit();">
                            <i class="ph-sign-out me-2"></i> {{ __('Logout') }}
                        </a>

                        <form id="logout-form" action="{{ route('logout') }}" method="POST" class="d-none">
                            @csrf
                        </form>
                    </div>
                </li>
            </ul>
        </div>
    </div>
    <!-- /main navbar -->

    <!-- Page content -->
    <div class="page-content">

        @include('layouts.sidebar')

        <!-- Main content -->
        <div class="content-wrapper">

            <!-- Inner content -->
            <div class="content-inner">

                @component('components.page-header')
                @slot('title') Sidebars @endslot
                @slot('subtitle') Default Hideable @endslot
                @endcomponent

                <!-- Content area -->
                <div class="content container pt-0">

                    <!-- Info alert -->
                    <div class="alert alert-success alert-dismissible">
                        <div class="alert-heading fw-semibold">Hideable default sidebar</div>
                        This example demonstrates <code>hideable</code> state. Sidebar toggler is moved outside the sidebar and added to navigation bar. You can have this button anywhere - content, card, page header or navbar. The only condition here is proper class names.
                        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                    </div>
                    <!-- /info alert -->


                    <!-- Sidebars overview -->
                    <div class="card">
                        <div class="card-header">
                            <h5 class="mb-0">Sidebars overview</h5>
                        </div>

                        <div class="card-body">
                            <p class="mb-3">Sidebar - vertical area that displays onscreen and presents widget components and website navigation menu in a text-based hierarchical form. All sidebars are css-driven - just add one of css classes to the <code>.sidebar</code> container, and sidebar will change its width and color. No js, css only. Although sidebar type is based on css, buttons do their job with JS - they switch necessary classes in <code>.sidebar</code> container. Below you'll find summarized tables with all available <code>button</code> and <code>sidebar</code> container classes. By default, the template includes 6 different sidebar types and combinations:</p>

                            <div class="mb-3">
                                <h6>1. Default sidebar</h6>
                                <p>Default template sidebar has <code>300px</code> (~18.75rem) width, aligned to the left (to the right in RTL version) and has dark blue background color. All navigation levels are based on accordion <strong>or</strong> collapsible functionality, open on click. Supports 2 versions: fixed (default) and static (in static layout only). Both versions use default browser scrollbars, but support custom scrollbars such as <code>perfect scrollbar</code> component.</p>
                            </div>

                            <div class="mb-3">
                                <h6>2. Mini sidebar</h6>
                                <p>Mini sidebar has <code>56px</code> width, which is calculated dynamically (icon size + double padding). No text in parent level of menu items, aligned to the left (to the right in RTL version) and has dark blue background color. Sidebar changes the width on hover, no additional changes. It is <strong>required</strong> to add <code>.sidebar-main-resized</code> class to the <code>.sidebar</code> container if you want to have it collapsed by default. This class is responsible for sidebar width and main navigation. By default all components except main navigation are hidden in mini sidebar. Can be used with main sidebar only.</p>
                            </div>

                            <div class="mb-3">
                                <h6>3. Secondary sidebar</h6>
                                <p>Main sidebar has <code>300px</code> width or <code>56px</code> (if <code>.sidebar-main-resized</code> class added). Secondary sidebar has the same fixed width of <code>300px</code>, which is similar to default and right sidebars, so different sidebar components can be placed to all sidebar types. Main and secondary sidebars can contain any content - menu, navigation, buttons, lists, tabs etc. Secondary sidebar can be either collapsed or hidden.</p>
                            </div>

                            <div class="mb-3">
                                <h6>4. Right sidebar</h6>
                                <p>Right sidebar layout includes additional sidebar displayed on the right (left in RTL direction) side. It is displayed as an additional component with 100% height, similar to other sidebars. Right sidebar is visible by default, but can be collapsed or hidden.</p>
                            </div>

                            <div class="mb-3">
                                <h6>5. Right/Secondary sidebars</h6>
                                <p>Secondary and Right sidebars can be used together, so basically it is a 4 column layout. The width of any sidebar doesn't affect other layout columns, they all have independent width controls. Refer to the table below for more information.</p>
                            </div>

                            <div class="mb-3">
                                <h6>6. Content (component) sidebar</h6>
                                <p>Usually sidebar is not a part of content and mainly used for navigation. Limitless allows you to use sidebar outside and inside content area. Content sidebar isn't based on grid and has the same width as other sidebars, this means all sidebar components can be placed inside content sidebar. Supports left and right positioning and can be either stretched to fill all available height or height that depends on sidebar content height.</p>
                            </div>
                        </div>
                    </div>
                    <!-- /sidebars overview -->


                    <!-- Button classes -->
                    <div class="card">
                        <div class="card-header">
                            <h5 class="mb-0">Button classes</h5>
                        </div>

                        <div class="card-body">
                            <h6>Overview</h6>
                            <p class="mb-3">This table displays all optional <code>button</code> classes, responsible for the sidebar appearance. Depending on the sidebar type, add one of these classes to any button or link and this element will handle sidebar control. Multiple controls are also available - add as many sidebar controls as you wish. Please note: these classes don't change sidebar markup, only CSS rules.</p>
                            <div class="table-responsive border rounded mb-4">
                                <table class="table">
                                    <thead class="table-light">
                                        <tr>
                                            <th class="border-top-0" style="width: 300px;">Button class</th>
                                            <th class="border-top-0">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td><code>.sidebar-main-resize</code></td>
                                            <td>Resizable sidebar. Changes main sidebar width from default to mini. This button is added to all pages by default.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-main-toggle</code></td>
                                            <td>Collapses/expands and/or hides/shows <code>main</code> sidebar. Used mostly in dual sidebar type to hide main sidebar.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-end-toggle</code></td>
                                            <td>Toggles right sidebar - if right sidebar is shown, main sidebar width remains the same, whether it's in default or mini mode.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-secondary-toggle</code></td>
                                            <td>Hides/shows or collapses/expands <code>secondary</code> sidebar. Secondary sidebar supports only toggle functionality and always has fixed width of <code>300px</code>.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-component-toggle</code></td>
                                            <td>Hides/shows <code>content</code> sidebars. Content sidebars aren't connected with other sidebars, so this is the only button that controls their visibility.</td>
                                        </tr>
                                        <tr class="border-top-width-2">
                                            <td><code>.sidebar-mobile-main-toggle</code></td>
                                            <td>Toggles <code>main</code> sidebar on mobile - slides from left to right.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-mobile-secondary-toggle</code></td>
                                            <td>Toggles <code>secondary</code> sidebar on mobile - slides from left to right.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-mobile-end-toggle</code></td>
                                            <td>Toggles <code>right</code> sidebar on mobile - slides from right to left.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-mobile-component-toggle</code></td>
                                            <td>Toggles <code>content</code> sidebar on mobile - has full width by default, has no animation.</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <h6>Example Markup</h6>
                            <p>Default placement of sidebar control buttons is sidebar header:</p>
                            <pre class="language-markup mb-3" data-line="13-19">
								<code>
									&lt;!-- Main sidebar -->
									&lt;div class="sidebar sidebar-dark sidebar-main sidebar-expand-lg">

										&lt;!-- Sidebar content -->
										&lt;div class="sidebar-content">

											&lt;!-- Header -->
											&lt;div class="sidebar-section">
												&lt;div class="sidebar-section-body d-flex justify-content-center">
													&lt;h6 class="sidebar-resize-hide flex-grow-1 my-auto">Navigation&lt;/h6>

													&lt;div>
														&lt;button type="button" class="[button classes]">
															&lt;i class="ph-arrows-left-right">&lt;/i>
														&lt;/button>

														&lt;button type="button" class="[button classes]">
															&lt;i class="ph-x">&lt;/i>
														&lt;/button>
													&lt;/div>
												&lt;/div>
											&lt;/div>
											&lt;!-- /header -->

											[other content]

										&lt;/div>
										&lt;!-- /sidebar content -->

									&lt;/div>
									&lt;!-- /main sidebar -->
								</code>
							</pre>

                            <p>Here is an example of button inside navbar:</p>
                            <pre class="language-markup" data-line="7-9">
								<code>
									&lt;!-- Navbar placement -->
									&lt;div class="navbar navbar-expand navbar-dark">
										&lt;div class="navbar-brand">...&lt;/div>

										&lt;ul class="navbar-nav">
											&lt;li class="nav-item">
												&lt;a href="#" class="navbar-nav-link sidebar-control sidebar-main-toggle">
													&lt;i class="ph-arrows-left-right">&lt;/i>
												&lt;/a>
											&lt;/li>
											...
										&lt;/ul>
									&lt;/div>
									&lt;!-- /navbar placement -->
								</code>
							</pre>
                        </div>
                    </div>
                    <!-- /button classes -->


                    <!-- Sidebar classes -->
                    <div class="card">
                        <div class="card-header">
                            <h5 class="mb-0">Sidebar classes</h5>
                        </div>

                        <div class="card-body">
                            <h6>Overview</h6>
                            <p class="mb-3">This table demonstrates all classes for <code>sidebar</code> container, responsible for the sidebar width and color. Almost all of these classes are mandatory, some of them are responsible for proper styling or have a specific code attached to this class (like <code>.sidebar-main</code> class, which has collapsible functionality). All classes can be combined depending on the type of sidebar:</p>
                            <div class="table-responsive border rounded mb-4">
                                <table class="table">
                                    <thead class="table-light">
                                        <tr>
                                            <th class="border-top-0" style="width: 300px">Body class</th>
                                            <th class="border-top-0">Description</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td><code>.sidebar</code></td>
                                            <td>Default sidebar class, should be added in all layout types.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-main</code></td>
                                            <td>Defines <strong>main</strong> sidebar. Mini sidebar (<code>.sidebar-main-resized</code> class) takes effect only if sidebar has <code>.sidebar-main</code> class. By default, all components except main navigation are hidden in mini sidebar.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-main-resized</code></td>
                                            <td>Defines <strong>main</strong> sidebar in <code>collapsed</code> state</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-secondary</code></td>
                                            <td>Defines <strong>secondary</strong> sidebar. Has fixed <code>270px</code> width and usually comes after main sidebar.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-secondary-collapsed</code></td>
                                            <td>Defines <strong>secondary</strong> sidebar in <code>collapsed</code> state</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-end</code></td>
                                            <td>Defines <strong>right</strong> sidebar. Has fixed <code>270px</code> width and appears on the right side from the main sidebar.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-end-collapsed</code></td>
                                            <td>Defines <strong>right</strong> sidebar in <code>collapsed</code> state</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-component</code></td>
                                            <td>This class is required in <strong>content</strong> (or component) sidebar. Also requires <code>.sidebar-component-left</code> or <code>.sidebar-component-right</code> classes for proper spacing.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-component-collapsed</code></td>
                                            <td>Defines <strong>content</strong> sidebar in collapsed state</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-dark</code></td>
                                            <td>Defines <strong>dark</strong> sidebar. This class can be applied to all sidebar types and positions. This class is also required for custom colors (see below).</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-dark.bg-*</code></td>
                                            <td>Defines sidebar background color. According to the custom color system, sidebar background color can be changed to one of the available colors by adding a proper class to the main sidebar container.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-expand-[breakpoint]</code></td>
                                            <td>This class specifies when sidebar needs to be collapsed, basically when sidebar switches to mobile mode. Breakpoint should always be similar to <strong>navbar</strong> breakpoint for proper matching. Available breakpoints are: xl, lg, md and sm. This class is required.</td>
                                        </tr>
                                        <tr>
                                            <td><code>.sidebar-main-unfold</code></td>
                                            <td>This class gets added when user hovers on mini sidebar. It controls resizable behaviour when main sidebar is collapsed. Has no effect on mobile since all sidebars on mobile have same width.</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <h6>Example Markup</h6>
                            <p>Default left aligned sidebar markup:</p>
                            <pre class="language-markup mb-3" data-line="15">
								<code>
									&lt;!-- Default sidebar layout -->
									&lt;body>

										&lt;!-- Navbar -->
										&lt;div class="navbar navbar-dark navbar-expand-lg">
											...
										&lt;/div>
										&lt;!-- /navbar -->


										&lt;!-- Page container -->
										&lt;div class="page-content">

											&lt;!-- Main sidebar -->
											&lt;div class="sidebar sidebar-dark sidebar-main sidebar-expand-lg">
												&lt;div class="sidebar-content">
													...
												&lt;/div>
											&lt;/div>
											&lt;!-- /main sidebar -->

											&lt;!-- Main content -->
											&lt;div class="content-wrapper">
												...
											&lt;/div>
											&lt;!-- /main content -->

										&lt;/div>
										&lt;!-- /page content -->

									&lt;/body>
									&lt;!-- /default sidebar layout -->
								</code>
							</pre>

                            <p>Mini sidebar markup. The only difference is <code>.sidebar-main-resized</code> class:</p>
                            <pre class="language-markup" data-line="15">
								<code>
									&lt;!-- Mini sidebar layout -->
									&lt;body>

										&lt;!-- Navbar -->
										&lt;div class="navbar navbar-dark navbar-expand-lg">
											...
										&lt;/div>
										&lt;!-- /navbar -->


										&lt;!-- Page container -->
										&lt;div class="page-content">

											&lt;!-- Main sidebar -->
											&lt;div class="sidebar sidebar-dark sidebar-main sidebar-expand-lg sidebar-main-resized">
												&lt;div class="sidebar-content">
													...
												&lt;/div>
											&lt;/div>
											&lt;!-- /main sidebar -->

											&lt;!-- Main content -->
											&lt;div class="content-wrapper">
												...
											&lt;/div>
											&lt;!-- /main content -->

										&lt;/div>
										&lt;!-- /page content -->

									&lt;/body>
									&lt;!-- /mini sidebar layout -->
								</code>
							</pre>
                        </div>
                    </div>
                    <!-- /sidebar classes -->

                </div>
                <!-- /content area -->

                @include('layouts.footer')


            </div>
            <!-- /inner content -->

        </div>
        <!-- /main content -->

    </div>
    <!-- /page content -->

    @include('layouts.notification')

    @include('layouts.right-sidebar')

</body>
</html>
