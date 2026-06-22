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
    <script src="{{URL::asset('assets/js/vendor/visualization/echarts/echarts.min.js')}}"></script>
    <script src="{{URL::asset('assets/js/vendor/maps/echarts/world.js')}}"></script>

    <script src="{{URL::asset('assets/js/app.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard_6/area_gradient.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard_6/map_europe_effect.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard_6/progress_sortable.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard_6/bars_grouped.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard_6/line_label_marks.js')}}"></script>
    <!-- /theme JS files -->

</head>

<body>

    <!-- Main navbar -->
    <div class="navbar navbar-expand-xl navbar-static shadow">
        <div class="container px-sm-3">
            <div class="d-flex d-xl-none me-2">
                <button type="button" class="navbar-toggler sidebar-mobile-main-toggle rounded-pill">
                    <i class="ph-list"></i>
                </button>
                <button type="button" class="navbar-toggler sidebar-mobile-secondary-toggle rounded-pill">
                    <i class="ph-arrow-left"></i>
                </button>
            </div>

            <div class="navbar-brand flex-1 d-none d-sm-flex">
                <a href="index" class="d-inline-flex align-items-center">
                    <img src="{{URL::asset('assets/images/logo_icon.svg')}}" alt="">
                    <img src="{{URL::asset('assets/images/logo_text_dark.svg')}}" class="d-none d-sm-inline-block h-16px invert-dark ms-3" alt="">
                </a>
            </div>

            <div class="d-flex w-100 w-xl-auto overflow-auto overflow-xl-visible scrollbar-hidden border-top border-top-xl-0 order-1 order-xl-0 pt-2 pt-xl-0 mt-2 mt-xl-0">
                <ul class="nav gap-1 justify-content-center flex-nowrap flex-xl-wrap mx-auto">
                    <li class="nav-item">
                        <a href="index" class="navbar-nav-link rounded">
                            Home
                        </a>
                    </li>

                    <li class="nav-item nav-item-dropdown">
                        <a href="#" class="navbar-nav-link dropdown-toggle rounded active" data-bs-toggle="dropdown" data-bs-auto-close="outside">
                            Navigation
                        </a>

                        <div class="dropdown-menu p-0">
                            <div class="d-xl-flex">
                                <div class="d-flex flex-row flex-xl-column bg-light overflow-auto overflow-xl-visible rounded-top rounded-top-xl-0 rounded-start-xl">
                                    <div class="flex-1 border-bottom border-bottom-xl-0 p-2 p-xl-3">
                                        <div class="fw-bold border-bottom d-none d-xl-block pb-2 mb-2">Navigation</div>
                                        <ul class="nav nav-pills flex-xl-column flex-nowrap text-nowrap justify-content-center wmin-xl-300" role="tablist">
                                            <li class="nav-item" role="presentation">
                                                <a href="#tab_section_active" class="nav-link rounded active" data-bs-toggle="tab" aria-selected="true" role="tab">
                                                    <i class="ph-layout me-2"></i>
                                                    Active section
                                                    <i class="ph-arrow-right nav-item-active-indicator d-none d-xl-inline-block ms-auto"></i>
                                                </a>
                                            </li>
                                            <li class="nav-item" role="presentation">
                                                <a href="#tab_section_inactive" class="nav-link rounded" data-bs-toggle="tab" aria-selected="false" tabindex="-1" role="tab">
                                                    <i class="ph-rows me-2"></i>
                                                    Inactive section
                                                    <i class="ph-arrow-right nav-item-active-indicator d-none d-xl-inline-block ms-auto"></i>
                                                </a>
                                            </li>
                                            <li class="nav-item" role="presentation">
                                                <a href="#tab_section_disabled" class="nav-link disabled rounded" data-bs-toggle="tab" aria-selected="false" tabindex="-1" role="tab">
                                                    <i class="ph-columns me-2"></i>
                                                    Disabled section
                                                    <i class="ph-arrow-right nav-item-active-indicator d-none d-xl-inline-block ms-auto"></i>
                                                </a>
                                            </li>
                                        </ul>
                                    </div>
                                </div>

                                <div class="tab-content flex-xl-1">
                                    <div class="tab-pane dropdown-scrollable-xl fade show active p-3" id="tab_section_active" role="tabpanel">
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
                                                <a href="layout_2_sidebars_1_side" class="dropdown-item rounded active">2 sidebars on 1 side</a>
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

                                    <div class="tab-pane dropdown-scrollable-xl fade p-3" id="tab_section_inactive" role="tabpanel">
                                        <div class="row">
                                            <div class="col-lg-3 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Column 1 title</div>
                                                <a href="#" class="dropdown-item rounded">Column 1 item 1</a>
                                                <a href="#" class="dropdown-item rounded">Column 1 item 2</a>
                                                <a href="#" class="dropdown-item rounded">Column 1 item 3</a>
                                                <a href="#" class="dropdown-item rounded">Column 1 item 4</a>
                                            </div>

                                            <div class="col-lg-3 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Column 2 title</div>
                                                <a href="#" class="dropdown-item rounded">Column 2 item 1</a>
                                                <a href="#" class="dropdown-item rounded">Column 2 item 2</a>
                                                <a href="#" class="dropdown-item rounded">Column 2 item 3</a>
                                                <a href="#" class="dropdown-item rounded">Column 2 item 4</a>
                                            </div>

                                            <div class="col-lg-3 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Column 3 title</div>
                                                <a href="#" class="dropdown-item rounded">Column 3 item 1</a>
                                                <a href="#" class="dropdown-item rounded">Column 3 item 2</a>
                                                <a href="#" class="dropdown-item rounded">Column 3 item 3</a>
                                                <a href="#" class="dropdown-item rounded">Column 3 item 4</a>
                                            </div>

                                            <div class="col-lg-3">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Column 4 title</div>
                                                <a href="#" class="dropdown-item rounded">Column 4 item 1</a>
                                                <a href="#" class="dropdown-item rounded">Column 4 item 2</a>
                                                <a href="#" class="dropdown-item rounded">Column 4 item 3</a>
                                                <a href="#" class="dropdown-item rounded">Column 4 item 4</a>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="tab-pane dropdown-scrollable-xl fade p-3" id="tab_section_disabled" role="tabpanel">
                                        Disabled tab content
                                    </div>
                                </div>
                            </div>
                        </div>
                    </li>

                    <li class="nav-item nav-item-dropdown-xl dropdown">
                        <a href="#" class="navbar-nav-link dropdown-toggle rounded" data-bs-toggle="dropdown">
                            Dropdown
                        </a>

                        <div class="dropdown-menu">
                            <a href="#" class="dropdown-item">Menu item 1</a>
                            <a href="#" class="dropdown-item">Menu item 2</a>
                            <a href="#" class="dropdown-item">Menu item 3</a>
                            <div class="dropdown-divider"></div>
                            <a href="#" class="dropdown-item">Menu item 4</a>
                        </div>
                    </li>

                    <li class="nav-item nav-item-dropdown-xl dropdown">
                        <a href="#" class="navbar-nav-link dropdown-toggle rounded" data-bs-toggle="dropdown">
                            Menu levels
                        </a>

                        <div class="dropdown-menu dropdown-menu-end">
                            <div class="dropdown-header">Header</div>
                            <a href="#" class="dropdown-item">Item 1</a>
                            <div class="dropdown-submenu dropdown-submenu-start">
                                <a href="#" class="dropdown-item dropdown-toggle">Item 2</a>
                                <div class="dropdown-menu">
                                    <a href="#" class="dropdown-item">Item 1.1</a>
                                    <a href="#" class="dropdown-item">Item 1.2</a>
                                    <div class="dropdown-submenu dropdown-submenu-start">
                                        <a href="#" class="dropdown-item dropdown-toggle">Item 1.3</a>
                                        <div class="dropdown-menu">
                                            <a href="#" class="dropdown-item">Item 1.3.1</a>
                                            <a href="#" class="dropdown-item">Item 1.3.2</a>
                                        </div>
                                    </div>
                                    <div class="dropdown-submenu dropdown-submenu-start">
                                        <a href="#" class="dropdown-item dropdown-toggle">Item 1.4</a>
                                        <div class="dropdown-menu">
                                            <a href="#" class="dropdown-item">Item 1.4.1</a>
                                            <a href="#" class="dropdown-item">Item 1.4.2</a>
                                        </div>
                                    </div>
                                    <a href="#" class="dropdown-item">Item 1.5</a>
                                </div>
                            </div>
                            <div class="dropdown-header">Header</div>
                            <a href="#" class="dropdown-item">Item 3</a>
                        </div>
                    </li>
                </ul>
            </div>

            <ul class="nav gap-1 flex-xl-1 justify-content-end order-0 order-xl-1">
                <li class="nav-item nav-item-dropdown-xl dropdown">
                    <a href="#" class="navbar-nav-link navbar-nav-link-icon rounded">
                        <i class="ph-squares-four"></i>
                    </a>
                </li>

                <li class="nav-item">
                    <a href="#" class="navbar-nav-link navbar-nav-link-icon rounded">
                        <i class="ph-bell"></i>
                        <span class="badge bg-yellow text-black position-absolute top-0 end-0 translate-middle-top zindex-1 rounded-pill mt-1 me-1">2</span>
                    </a>
                </li>

                <li class="nav-item nav-item-dropdown-xl dropdown">
                    <a href="#" class="navbar-nav-link align-items-center rounded p-1" data-bs-toggle="dropdown">
                        <div class="status-indicator-container">
                            <img src="@if (Auth::user()->avatar != ''){{ URL::asset('images/' . Auth::user()->avatar) }}@else{{ URL::asset('assets/images/users/avatar-1.jpg') }}@endif" class="w-32px h-32px rounded-pill" alt="">
                            <span class="status-indicator bg-success"></span>
                        </div>
                        <span class="d-none d-md-inline-block mx-md-2">{{Auth::user()->name}}</span>
                    </a>

                    <div class="dropdown-menu dropdown-menu-end">
                        <a href="#" class="dropdown-item">Action</a>
                        <a href="#" class="dropdown-item">Another action</a>
                        <a href="#" class="dropdown-item">Something else here</a>
                        <a href="#" class="dropdown-item">One more line</a>
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

        <!-- Main content -->
        <div class="content-wrapper">

            <!-- Inner content -->
            <div class="content-inner">

                <!-- Page header -->
				<div class="page-header">
					<div class="page-header-content container d-lg-flex">
						<div class="d-flex">
							<h4 class="page-title mb-0">
								Seed - <span class="fw-normal">Static Layout</span>
							</h4>

							<a href="#page_header" class="btn btn-light align-self-center collapsed d-lg-none border-transparent rounded-pill p-0 ms-auto" data-bs-toggle="collapse">
								<i class="ph-caret-down collapsible-indicator ph-sm m-1"></i>
							</a>
						</div>

						<div class="collapse d-lg-block my-lg-auto ms-lg-auto" id="page_header">
							<div class="hstack gap-3 mb-3 mb-lg-0">
								<button type="button" class="btn btn-primary">
									<i class="ph-gear me-2"></i>
									Button
								</button>

								<div class="dropdown">
									<button type="button" class="btn btn-outline-primary dropdown-toggle" data-bs-toggle="dropdown">
										Dropdown
									</button>

									<div class="dropdown-menu dropdown-menu-end">
										<button type="button" class="dropdown-item">Menu item 1</button>
										<button type="button" class="dropdown-item">Menu item 2</button>
										<button type="button" class="dropdown-item">Menu item 3</button>
										<div class="dropdown-divider"></div>
										<button type="button" class="dropdown-item">Menu item 4</button>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
				<!-- /page header -->

               <!-- Content area -->
				<div class="content container pt-0">

					<!-- Basic card -->
					<div class="card">
						<div class="card-header">
							<h5 class="mb-0">Basic card</h5>
						</div>

						<div class="card-body">
							<h6>Start your development with no hassle!</h6>
							<p class="mb-3">Common problem of templates is that all code is deeply integrated into the core. This limits your freedom in decreasing amount of code, i.e. it becomes pretty difficult to remove unnecessary code from the project. Limitless allows you to remove unnecessary and extra code easily just by disabling styling of certain components in <code>_config.scss</code>. Styling of all 3rd party components are stored in separate SCSS files that begin with <code>$enable-[component]</code> condition, which checks if this component is enabled in SCSS configuration and either includes or excludes it from bundled CSS file. Use only components you actually need!</p>

							<h6>What is this?</h6>
							<p class="mb-3">Starter kit is a set of pages, useful for developers to start development process from scratch. Each layout includes base components only: layout, page kits, color system which is still optional, bootstrap files and bootstrap overrides. No extra CSS/JS files and markup. CSS files are compiled without any plugins or components. Starter kit is moved to a separate folder for better accessibility.</p>

							<h6>How does it work?</h6>
							<p>You open one of the starter pages, add necessary plugins, enable components in <code>_config.scss</code> file, compile new CSS. That's it. It's also recommended to open one of main pages with functionality you need and copy all paths/JS code from there to your new page, if you don't need to change file structure.</p>
						</div>
					</div>
					<!-- /basic card -->


					<!-- Basic table -->
					<div class="card">
						<div class="card-header">
							<h5 class="mb-0">Basic table</h5>
						</div>

						<div class="card-body">
							Seed project includes the most basic components that can help you in development process - basic grid example, card, table and form layouts with standard components. Nothing extra. Easily turn on and off styles of different components to keep your CSS as clean as possible. Bootstrap components are always enabled.
						</div>

						<div class="table-responsive">
							<table class="table">
								<thead>
									<tr>
										<th>#</th>
										<th>First Name</th>
										<th>Last Name</th>
										<th>Username</th>
									</tr>
								</thead>
								<tbody>
									<tr>
										<td>1</td>
										<td>Eugene</td>
										<td>Kopyov</td>
										<td>@Kopyov</td>
									</tr>
									<tr>
										<td>2</td>
										<td>Victoria</td>
										<td>Baker</td>
										<td>@Vicky</td>
									</tr>
									<tr>
										<td>3</td>
										<td>James</td>
										<td>Alexander</td>
										<td>@Alex</td>
									</tr>
									<tr>
										<td>4</td>
										<td>Franklin</td>
										<td>Morrison</td>
										<td>@Frank</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>
					<!-- /basic table -->


					<!-- Form layouts -->
					<div class="row">
						<div class="col-lg-6">

							<!-- Horizontal form -->
							<div class="card">
								<div class="card-header d-flex align-items-center">
									<h5 class="mb-0">Horizontal form</h5>
									<div class="hstack gap-2 ms-auto">
										<a class="text-body" data-card-action="collapse">
											<i class="ph-caret-down"></i>
										</a>
										<a class="text-body" data-card-action="reload">
											<i class="ph-arrows-clockwise"></i>
										</a>
										<a class="text-body" data-card-action="remove">
											<i class="ph-x"></i>
										</a>
									</div>
			                	</div>

			                	<div class="collapse show">
									<div class="card-body">
										<form action="#">
											<div class="row mb-3">
												<label class="col-lg-3 col-form-label">Text input</label>
												<div class="col-lg-9">
													<input type="text" class="form-control" placeholder="Text input">
												</div>
											</div>

											<div class="row mb-3">
												<label class="col-lg-3 col-form-label">Password</label>
												<div class="col-lg-9">
													<input type="password" class="form-control" placeholder="Password input">
												</div>
											</div>

					                        <div class="row mb-3">
					                        	<label class="col-lg-3 col-form-label">Select</label>
					                        	<div class="col-lg-9">
						                            <select name="select" class="form-select">
						                                <option value="opt1">Basic select</option>
						                                <option value="opt2">Option 2</option>
						                                <option value="opt3">Option 3</option>
						                                <option value="opt4">Option 4</option>
						                                <option value="opt5">Option 5</option>
						                                <option value="opt6">Option 6</option>
						                                <option value="opt7">Option 7</option>
						                                <option value="opt8">Option 8</option>
						                            </select>
					                            </div>
					                        </div>

											<div class="row mb-3">
												<label class="col-lg-3 col-form-label">Textarea</label>
												<div class="col-lg-9">
													<textarea rows="5" cols="5" class="form-control" placeholder="Default textarea"></textarea>
												</div>
											</div>

											<div class="text-end">
												<button type="submit" class="btn btn-primary">Submit form <i class="ph-paper-plane-tilt ms-2"></i></button>
											</div>
										</form>
									</div>
								</div>
							</div>
							<!-- /horizotal form -->

						</div>

						<div class="col-lg-6">

							<!-- Vertical form -->
							<div class="card">
								<div class="card-header d-flex align-items-center">
									<h5 class="mb-0">Vertical form</h5>
									<div class="hstack gap-2 ms-auto">
										<a class="text-body" data-card-action="collapse">
											<i class="ph-caret-down"></i>
										</a>
										<a class="text-body" data-card-action="reload">
											<i class="ph-arrows-clockwise"></i>
										</a>
										<a class="text-body" data-card-action="remove">
											<i class="ph-x"></i>
										</a>
									</div>
			                	</div>

			                	<div class="collapse show">
									<div class="card-body">
										<form action="#">
											<div class="mb-3">
												<label class="form-label">Text input</label>
												<input type="text" class="form-control" placeholder="Text input">
											</div>

					                        <div class="mb-3">
					                        	<label class="form-label">Select</label>
					                            <select name="select" class="form-select">
					                                <option value="opt1">Basic select</option>
					                                <option value="opt2">Option 2</option>
					                                <option value="opt3">Option 3</option>
					                                <option value="opt4">Option 4</option>
					                                <option value="opt5">Option 5</option>
					                                <option value="opt6">Option 6</option>
					                                <option value="opt7">Option 7</option>
					                                <option value="opt8">Option 8</option>
					                            </select>
					                        </div>

											<div class="mb-3">
												<label class="form-label">Textarea</label>
												<textarea rows="4" cols="4" class="form-control" placeholder="Default textarea"></textarea>
											</div>

											<div class="text-end">
												<button type="submit" class="btn btn-primary">Submit form <i class="ph-paper-plane-tilt ms-2"></i></button>
											</div>
										</form>
									</div>
								</div>
							</div>
							<!-- /vertical form -->

						</div>
					</div>
					<!-- /form layouts -->

				</div>
				<!-- /content area -->

                @include('layouts.footer')

            </div>
            <!-- /inner content -->

        </div>
        <!-- /main content -->

    </div>
    <!-- /page content -->

    @include('layouts.right-sidebar')

</body>
</html>
